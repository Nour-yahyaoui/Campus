import pg from "pg";
import { getEnv } from "./env";
import { unavailable } from "./errors";

const { Pool, types } = pg;

// Return int8 as a number for counters (row counts never approach 2^53 here).
types.setTypeParser(20, (value: string) => Number(value));

let pool: pg.Pool | null = null;

/**
 * node-postgres does not know custom enum array types, so a `global_role[]`
 * column arrives as the Postgres literal `{student,super_admin}` instead of an
 * array. Everything that reads such a column goes through here.
 */
export function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  const literal = value.trim();
  if (!literal || literal === "{}") return [];
  if (literal.startsWith("{") && literal.endsWith("}")) {
    const inner = literal.slice(1, -1);
    const parts: string[] = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < inner.length; i += 1) {
      const char = inner[i]!;
      if (char === '"') {
        if (quoted && inner[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === "," && !quoted) {
        parts.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    parts.push(current);
    return parts.map((part) => part.trim()).filter(Boolean);
  }
  return [literal];
}

function sslFor(url: string): pg.PoolConfig["ssl"] {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "unknown";
    }
  })();
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (local || process.env.PGSSL === "disable") return undefined;
  return { rejectUnauthorized: process.env.PGSSL_NO_VERIFY !== "true" };
}

export function getPool(): pg.Pool {
  if (!pool) {
    const env = getEnv();
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.DB_POOL_MAX,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: sslFor(env.DATABASE_URL),
      // PgBouncer keeps track of only a few startup parameters, and Neon's
      // pooled endpoint refuses anything else: sending
      // `options=-c statement_timeout=…` makes every connection fail with
      // "unsupported startup parameter in options". So the server-side limit
      // is not in the startup packet; `query_timeout` is enforced by the
      // client and works through any pooler. Transactions add SET LOCAL
      // limits (see `transaction`), and OPERATIONS documents the role-level
      // setting for defence in depth.
      application_name: "campussphere",
      query_timeout: 10_000,
    });
    pool.on("error", (error) => {
      console.error("[db] idle client error", error.message);
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<pg.QueryResult<T>> {
  try {
    return await getPool().query<T>(text, values as unknown[]);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "57P01" || code === "53300") {
      throw unavailable("The database is temporarily unavailable.");
    }
    throw error;
  }
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<T | null> {
  const result = await query<T>(text, values);
  return result.rows[0] ?? null;
}

export async function many<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<T[]> {
  const result = await query<T>(text, values);
  return result.rows;
}

/**
 * Runs work inside a transaction. The callback receives a dedicated client, so
 * every statement must use it rather than the shared pool.
 */
export async function transaction<T>(
  work: (client: pg.PoolClient) => Promise<T>,
  options: { statementTimeoutMs?: number } = {},
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    // SET LOCAL works on a direct connection and through a transaction-mode
    // pooler, unlike session-level SET. It scopes the limit to this
    // transaction, which is exactly what we want. Schema creation is the one
    // caller that needs longer, because a suspended Neon compute has to wake up.
    const statementTimeout = Math.max(1_000, options.statementTimeoutMs ?? 10_000);
    await client.query(`set local statement_timeout = ${statementTimeout}; set local lock_timeout = 5000;`);
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

export interface Cursor {
  at: string;
  id: string;
}

export function encodeCursor(at: Date | string, id: string): string {
  const iso = typeof at === "string" ? at : at.toISOString();
  return Buffer.from(JSON.stringify({ at: iso, id }), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | null | undefined): Cursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Cursor;
    if (typeof parsed.at !== "string" || typeof parsed.id !== "string") return null;
    if (Number.isNaN(Date.parse(parsed.at))) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function pageLimit(requested: number | undefined, fallback = 12, max = 48): number {
  if (!requested || !Number.isFinite(requested)) return fallback;
  return Math.min(Math.max(1, Math.trunc(requested)), max);
}

/* ------------------------------------------------------------------ */
/* Serialisation helpers                                               */
/* ------------------------------------------------------------------ */

export function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return typeof value === "string" ? value : value.toISOString();
}

export function isoRequired(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

const SLUG_MAX = 80;

export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  return base || "entry";
}

export function slugSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Generates a unique slug for a table. Collisions are resolved with a random
 * suffix; the database unique constraint remains the final authority.
 */
export async function uniqueSlug(
  table: "clubs" | "projects" | "events",
  title: string,
  ignoreId?: string,
): Promise<string> {
  const base = slugify(title);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base.slice(0, SLUG_MAX - 7)}-${slugSuffix()}`;
    const existing = await one<{ id: string }>(
      `select id from ${table} where slug = $1 ${ignoreId ? "and id <> $2" : ""} limit 1`,
      ignoreId ? [candidate, ignoreId] : [candidate],
    );
    if (!existing) return candidate;
  }
  return `${base.slice(0, SLUG_MAX - 13)}-${Date.now().toString(36)}`;
}

export function likePattern(input: string): string {
  return `%${input.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
