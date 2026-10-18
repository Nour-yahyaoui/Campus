import { createHash, timingSafeEqual } from "node:crypto";
import { one } from "@campussphere/core";

/**
 * First-run helpers for `/api/initialize`.
 *
 * Design constraints, in order:
 * 1. A fresh deployment must be usable by opening one URL — no shell, no
 *    migration commands, no separate seeding step.
 * 2. That URL must not stay dangerous afterwards.
 * 3. Nothing secret is returned; the admin email is echoed because the caller
 *    supplied it.
 */

/** Constant-time comparison of two arbitrary strings. */
export function tokenMatches(expected: string, provided: string | null): boolean {
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(provided).digest();
  return timingSafeEqual(a, b);
}

export interface DatabaseState {
  schemaReady: boolean;
  users: number;
  superAdmins: number;
}

export async function readDatabaseState(): Promise<DatabaseState> {
  // `to_regclass` reports whether a table exists without raising
  // "relation does not exist", which is the normal state of a new Neon branch.
  const tables = await one<{ has_users: boolean; has_ledger: boolean }>(
    "select to_regclass('public.users') is not null as has_users, to_regclass('public.schema_migrations') is not null as has_ledger",
  );
  if (!tables?.has_users) return { schemaReady: false, users: 0, superAdmins: 0 };
  const counts = await one<{ users: number; super_admins: number }>(
    "select count(*)::int as users, count(*) filter (where 'super_admin'::global_role = any(roles))::int as super_admins from users",
  );
  return {
    schemaReady: Boolean(tables.has_ledger),
    users: counts?.users ?? 0,
    superAdmins: counts?.super_admins ?? 0,
  };
}

export type AccessDecision =
  | { mode: "write"; reason: "token" | "first-run"; allowAdmin: boolean; allowDemo: boolean }
  | { mode: "read-only"; reason: "already-initialized" | "needs-token" }
  | { mode: "denied"; status: 401 | 403; message: string };

/**
 * Who may change the database through `/api/initialize`.
 *
 * The route used to be writable by anyone whenever `SETUP_TOKEN` was unset and
 * no super-admin existed — which is exactly the state a fresh deployment is in,
 * and exactly the window a scanner finds. In production the rule is now:
 *
 * - a configured `SETUP_TOKEN` is required for any write, unless
 * - `INITIAL_ADMIN_EMAIL` is configured, in which case the route may apply
 *   migrations but can never create an account (the first admin comes from a
 *   verified Google sign-in instead).
 *
 * Development and preview keep the old convenience, because there the operator
 * *is* whoever can reach the machine.
 */
export function decideAccess(input: {
  tokenConfigured: boolean;
  expectedToken: string;
  providedToken: string | null;
  state: DatabaseState;
  isProduction?: boolean;
  initialAdminConfigured?: boolean;
}): AccessDecision {
  const {
    tokenConfigured,
    expectedToken,
    providedToken,
    state,
    isProduction = false,
    initialAdminConfigured = false,
  } = input;

  if (tokenConfigured) {
    if (tokenMatches(expectedToken, providedToken)) {
      return { mode: "write", reason: "token", allowAdmin: true, allowDemo: true };
    }
    return {
      mode: "denied",
      status: 401,
      message: "Wrong or missing setup token. Add ?token=… (the SETUP_TOKEN value) to this URL.",
    };
  }

  if (state.superAdmins > 0) return { mode: "read-only", reason: "already-initialized" };

  if (!isProduction) return { mode: "write", reason: "first-run", allowAdmin: true, allowDemo: true };

  if (initialAdminConfigured) {
    // Migrations only: no account creation, no demo content.
    return { mode: "write", reason: "first-run", allowAdmin: false, allowDemo: false };
  }

  return {
    mode: "denied",
    status: 403,
    message:
      "Setup writes are locked in production. Set SETUP_TOKEN and call this URL with ?token=…, " +
      "or set INITIAL_ADMIN_EMAIL and sign in with that Google account to become the first super-admin.",
  };
}

/** Escapes everything interpolated into the small HTML page below. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
