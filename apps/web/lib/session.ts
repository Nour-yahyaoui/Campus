import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  type Me,
} from "@campussphere/contracts";
import { createSession, resolveSession, revokeSession, type SessionResult } from "@campussphere/core";

const secure = process.env.NODE_ENV === "production";

export async function currentUser(): Promise<Me | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveSession(token);
}

export async function requireUser(returnTo = "/dashboard"): Promise<Me> {
  const me = await currentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return me;
}

export async function requireSuperAdmin(returnTo = "/admin"): Promise<Me> {
  const me = await requireUser(returnTo);
  if (!me.roles.includes("super_admin")) redirect("/dashboard?denied=admin");
  return me;
}

export async function setSessionCookie(session: Pick<SessionResult, "token" | "expiresAt">): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  store.delete(SESSION_COOKIE);
}

export async function signInAndSetCookie(userId: string, meta: { userAgent?: string | null; ip?: string | null }) {
  const session = await createSession(userId, meta);
  await setSessionCookie(session);
  return session;
}

export function safeNext(value: string | null | undefined): string {
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}
