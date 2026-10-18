import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Me } from "@campussphere/contracts";
export type { Me };
import { SESSION_TTL_SECONDS, OAUTH_FLOW_TTL_SECONDS } from "@campussphere/contracts";
import { getEnv, siteUrl } from "./env";
import { isoRequired, one, query, stringArray, transaction } from "./db";
import { AppError, badRequest, conflict, unauthorized } from "./errors";
import { writeAudit } from "./audit";

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

interface UserRow {
  id: string;
  google_sub: string | null;
  email: string;
  email_verified: boolean;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  roles: string[];
  status: string;
  created_at: Date;
}

export interface SessionResult {
  token: string;
  expiresAt: Date;
  user: Me;
}

async function toMe(row: UserRow): Promise<Me> {
  const unread = await one<{ n: number }>(
    "select count(*)::int as n from notifications where user_id = $1 and read_at is null",
    [row.id],
  );
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.email_verified,
    name: row.name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    roles: stringArray(row.roles) as Me["roles"],
    createdAt: isoRequired(row.created_at),
    unreadNotifications: unread?.n ?? 0,
  };
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<SessionResult> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const ipHash = meta.ip ? hashToken(meta.ip).slice(0, 32) : null;
  await query(
    `insert into sessions (user_id, token_hash, expires_at, user_agent, ip_hash)
     values ($1, $2, $3, $4, $5)`,
    [userId, hashToken(token), expiresAt, meta.userAgent?.slice(0, 400) ?? null, ipHash],
  );
  const row = await one<UserRow>("select * from users where id = $1", [userId]);
  if (!row) throw unauthorized("Account no longer exists");
  return { token, expiresAt, user: await toMe(row) };
}

export async function resolveSession(token: string | null | undefined): Promise<Me | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const row = await one<UserRow & { session_id: string; expires_at: Date; revoked_at: Date | null }>(
    `select u.*, s.id as session_id, s.expires_at, s.revoked_at
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1`,
    [hashToken(token)],
  );
  if (!row) return null;
  if (row.revoked_at || row.expires_at.getTime() < Date.now()) return null;
  if (row.status !== "active") return null;
  // Refresh presence at most every few minutes to keep write volume low.
  await query(
    "update users set last_seen_at = now() where id = $1 and (last_seen_at is null or last_seen_at < now() - interval '5 minutes')",
    [row.id],
  );
  return toMe(row);
}

export async function revokeSession(token: string): Promise<void> {
  await query(
    "update sessions set revoked_at = now() where token_hash = $1 and revoked_at is null",
    [hashToken(token)],
  );
}

export async function revokeAllSessions(userId: string, exceptToken?: string): Promise<number> {
  const result = await query(
    `update sessions set revoked_at = now()
      where user_id = $1 and revoked_at is null
        and ($2::text is null or token_hash <> $2)`,
    [userId, exceptToken ? hashToken(exceptToken) : null],
  );
  return result.rowCount ?? 0;
}

export async function rotateSession(
  oldToken: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<SessionResult> {
  const session = await one<{ user_id: string }>(
    "select user_id from sessions where token_hash = $1 and revoked_at is null",
    [hashToken(oldToken)],
  );
  if (!session) throw unauthorized("Session expired. Sign in again.");
  await revokeSession(oldToken);
  return createSession(session.user_id, meta);
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

export async function findMeById(userId: string): Promise<Me | null> {
  const row = await one<UserRow>("select * from users where id = $1", [userId]);
  return row ? toMe(row) : null;
}

export async function requireMe(userId: string | null | undefined): Promise<Me> {
  if (!userId) throw unauthorized();
  const me = await findMeById(userId);
  if (!me) throw unauthorized("Account no longer exists");
  return me;
}

export function isSuperAdmin(me: Pick<Me, "roles"> | null | undefined): boolean {
  return Boolean(me?.roles.includes("super_admin"));
}

export function isModerator(me: Pick<Me, "roles"> | null | undefined): boolean {
  return Boolean(me?.roles.includes("moderator") || me?.roles.includes("super_admin"));
}

type ActorInput = Me | string | null | undefined;

async function resolveActor(actor: ActorInput): Promise<Me> {
  if (!actor) throw unauthorized();
  if (typeof actor === "string") return requireMe(actor);
  return actor;
}

export async function requireSuperAdmin(actor: ActorInput): Promise<Me> {
  const me = await resolveActor(actor);
  if (!isSuperAdmin(me)) throw new AppError("forbidden", "Super-admin access is required", 403);
  return me;
}

export async function requireModerator(actor: ActorInput): Promise<Me> {
  const me = await resolveActor(actor);
  if (!isModerator(me)) throw new AppError("forbidden", "Moderator access is required", 403);
  return me;
}

interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

async function upsertGoogleUser(profile: GoogleProfile): Promise<string> {
  return transaction(async (client) => {
    const bySub = await client.query<UserRow>("select * from users where google_sub = $1", [profile.sub]);
    if (bySub.rows[0]) {
      if (bySub.rows[0].status !== "active") throw unauthorized("This account is not active.");
      await client.query(
        `update users set email = $2, email_verified = $3, name = $4, avatar_url = $5
          where id = $1`,
        [bySub.rows[0].id, profile.email, profile.emailVerified, profile.name, profile.picture],
      );
      return bySub.rows[0].id;
    }

    const byEmail = await client.query<UserRow>("select * from users where lower(email) = $1", [
      profile.email,
    ]);
    if (byEmail.rows[0]) {
      if (byEmail.rows[0].google_sub) {
        throw conflict("This email is already linked to another Google account.");
      }
      if (!byEmail.rows[0].email_verified && !profile.emailVerified) {
        throw conflict("Verify this email with Google before linking it.");
      }
      await client.query(
        `update users set google_sub = $2, email_verified = $3, name = $4, avatar_url = $5
          where id = $1`,
        [byEmail.rows[0].id, profile.sub, profile.emailVerified, profile.name, profile.picture],
      );
      return byEmail.rows[0].id;
    }

    const inserted = await client.query<UserRow>(
      `insert into users (google_sub, email, email_verified, name, avatar_url)
       values ($1, $2, $3, $4, $5) returning id`,
      [profile.sub, profile.email, profile.emailVerified, profile.name, profile.picture],
    );
    return inserted.rows[0]!.id;
  });
}

/* ------------------------------------------------------------------ */
/* Google OAuth / OIDC                                                 */
/* ------------------------------------------------------------------ */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function googleJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
  return jwks;
}

export function googleRedirectUri(): string {
  return `${siteUrl()}/api/auth/google/callback`;
}

export interface OAuthFlow {
  url: string;
  state: string;
  nonce: string;
  verifier: string;
  expiresAt: Date;
}

export async function beginGoogleFlow(redirectTo = "/"): Promise<OAuthFlow> {
  const env = getEnv();
  if (!env.googleConfigured) throw badRequest("Google sign-in is not configured on this deployment.");
  const state = randomToken(24);
  const nonce = randomToken(24);
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const expiresAt = new Date(Date.now() + OAUTH_FLOW_TTL_SECONDS * 1000);
  const safeRedirect = redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/";

  await query(
    `insert into oauth_states (state_hash, nonce_hash, verifier_hash, redirect_to, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [hashToken(state), hashToken(nonce), hashToken(verifier), safeRedirect, expiresAt],
  );

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return { url: `${GOOGLE_AUTH_URL}?${params.toString()}`, state, nonce, verifier, expiresAt };
}

export async function completeGoogleFlow(input: {
  code: string;
  state: string;
  cookieState: string | null;
  cookieVerifier: string | null;
  userAgent?: string | null;
  ip?: string | null;
}): Promise<{ session: SessionResult; redirectTo: string }> {
  const env = getEnv();
  if (!env.googleConfigured) throw badRequest("Google sign-in is not configured on this deployment.");
  if (!input.cookieState || !constantTimeEqual(input.state, input.cookieState)) {
    throw badRequest("The sign-in request could not be verified. Start again.");
  }
  if (!input.cookieVerifier) throw badRequest("The sign-in request is missing its verifier.");

  const stored = await one<{
    id: string;
    nonce_hash: string;
    verifier_hash: string;
    redirect_to: string;
    expires_at: Date;
    consumed_at: Date | null;
  }>("select * from oauth_states where state_hash = $1", [hashToken(input.state)]);

  if (!stored || stored.consumed_at || stored.expires_at.getTime() < Date.now()) {
    throw badRequest("The sign-in request expired. Start again.");
  }
  if (stored.verifier_hash !== hashToken(input.cookieVerifier)) {
    throw badRequest("The sign-in request could not be verified.");
  }
  await query("update oauth_states set consumed_at = now() where id = $1 and consumed_at is null", [
    stored.id,
  ]);

  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    client_secret: env.GOOGLE_CLIENT_SECRET!,
    code: input.code,
    code_verifier: input.cookieVerifier,
    grant_type: "authorization_code",
    redirect_uri: googleRedirectUri(),
  });

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new AppError("unavailable", "Google sign-in is temporarily unreachable.", 503);
  }
  if (!tokenResponse.ok) {
    throw badRequest("Google rejected the sign-in attempt. Start again.");
  }
  const tokens = (await tokenResponse.json()) as { id_token?: string };
  if (!tokens.id_token) throw badRequest("Google did not return an identity token.");

  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(tokens.id_token, googleJwks(), {
      issuer: GOOGLE_ISSUERS,
      audience: env.GOOGLE_CLIENT_ID!,
      clockTolerance: 30,
    });
    payload = verified.payload as Record<string, unknown>;
  } catch {
    throw unauthorized("The Google identity token could not be verified.");
  }

  if (typeof payload.nonce !== "string" || hashToken(payload.nonce) !== stored.nonce_hash) {
    throw unauthorized("The Google identity token nonce does not match.");
  }
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  const sub = typeof payload.sub === "string" ? payload.sub : null;
  if (!email || !sub) throw unauthorized("Google did not share an email address.");

  const userId = await upsertGoogleUser({
    sub,
    email,
    emailVerified: payload.email_verified === true,
    name:
      typeof payload.name === "string" && payload.name.trim()
        ? payload.name.trim().slice(0, 120)
        : email.split("@")[0]!,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  });

  const session = await createSession(userId, { userAgent: input.userAgent, ip: input.ip });
  await writeAudit({
    actorId: userId,
    action: "auth.login",
    entityType: "user",
    entityId: userId,
    metadata: { provider: "google" },
  });
  return { session, redirectTo: stored.redirect_to };
}

/* ------------------------------------------------------------------ */
/* Development sign-in                                                 */
/* ------------------------------------------------------------------ */

/**
 * Development-only identity. It exists so the app and tests are usable without
 * Google credentials. It is refused outright in production (see env.ts) and
 * every use is recorded as a distinct audit action.
 */
export async function devSignIn(input: {
  email: string;
  name?: string;
  userAgent?: string | null;
  ip?: string | null;
}): Promise<SessionResult> {
  const env = getEnv();
  if (!env.devSignInEnabled) {
    throw new AppError("forbidden", "Development sign-in is disabled on this deployment.", 403);
  }
  const email = input.email.trim().toLowerCase();
  const existing = await one<UserRow>("select * from users where lower(email) = $1", [email]);
  let userId: string;
  if (existing) {
    if (existing.status !== "active") throw unauthorized("This account is not active.");
    userId = existing.id;
    if (input.name && input.name !== existing.name) {
      await query("update users set name = $2 where id = $1", [userId, input.name.slice(0, 120)]);
    }
  } else {
    const created = await one<{ id: string }>(
      `insert into users (email, email_verified, name)
       values ($1, true, $2) returning id`,
      [email, (input.name ?? email.split("@")[0]!).slice(0, 120)],
    );
    userId = created!.id;
  }
  const session = await createSession(userId, { userAgent: input.userAgent, ip: input.ip });
  await writeAudit({
    actorId: userId,
    action: "auth.dev_login",
    entityType: "user",
    entityId: userId,
    metadata: { email, environment: env.APP_ENV },
  });
  return session;
}

/* ------------------------------------------------------------------ */
/* Cross-service sign-in tickets                                       */
/* ------------------------------------------------------------------ */

/**
 * Short-lived single-use ticket used to hand a session from the standalone
 * fallback API (different origin) to the web app. The ticket is useless
 * without the matching session cookie and expires in 60 seconds.
 */
export async function issueSignInTicket(userId: string): Promise<{ ticket: string; expiresAt: Date }> {
  const ticket = randomToken(32);
  const expiresAt = new Date(Date.now() + 60_000);
  await query(
    `insert into sign_in_tickets (ticket_hash, user_id, expires_at) values ($1, $2, $3)`,
    [hashToken(ticket), userId, expiresAt],
  );
  return { ticket, expiresAt };
}

export async function consumeSignInTicket(
  ticket: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<SessionResult> {
  const row = await one<{ id: string; user_id: string; expires_at: Date; consumed_at: Date | null }>(
    "select * from sign_in_tickets where ticket_hash = $1",
    [hashToken(ticket)],
  );
  if (!row || row.consumed_at || row.expires_at.getTime() < Date.now()) {
    throw unauthorized("This sign-in link expired. Start again.");
  }
  const consumed = await query(
    "update sign_in_tickets set consumed_at = now() where id = $1 and consumed_at is null",
    [row.id],
  );
  if (consumed.rowCount !== 1) throw unauthorized("This sign-in link was already used.");
  return createSession(row.user_id, meta);
}
