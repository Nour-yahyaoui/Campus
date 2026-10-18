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
  | { mode: "write"; reason: "token" | "first-run" }
  | { mode: "read-only"; reason: "already-initialized" }
  | { mode: "denied"; status: 401 | 403; message: string };

/**
 * `SETUP_TOKEN` is optional so the minimum configuration stays
 * `DATABASE_URL` + Google credentials. Without it the route may only *change* a
 * database that has no super-admin yet — the first-run window. After that it
 * reports status and writes nothing, even when the variable is unset.
 */
export function decideAccess(input: {
  tokenConfigured: boolean;
  expectedToken: string;
  providedToken: string | null;
  state: DatabaseState;
}): AccessDecision {
  const { tokenConfigured, expectedToken, providedToken, state } = input;

  if (tokenConfigured) {
    if (tokenMatches(expectedToken, providedToken)) return { mode: "write", reason: "token" };
    return {
      mode: "denied",
      status: 401,
      message: "Wrong or missing setup token. Add ?token=… (the SETUP_TOKEN value) to this URL.",
    };
  }

  if (state.superAdmins === 0) return { mode: "write", reason: "first-run" };
  return { mode: "read-only", reason: "already-initialized" };
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
