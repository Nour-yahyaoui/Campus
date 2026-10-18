import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { transaction } from "./db";

/**
 * Schema application, usable from both the CLI (`scripts/db.mjs`) and the app
 * itself (`/api/initialize`), so a fresh deployment needs no terminal step.
 *
 * The ledger (`schema_migrations`) and the checksum format are identical to the
 * CLI's, which matters: whichever path creates the database, the other one must
 * recognise it as up to date and must never re-run a migration.
 */

export interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrationStatus {
  directory: string;
  applied: string[];
  pending: string[];
  /** Applied migrations whose file changed afterwards — a release error. */
  changed: string[];
  total: number;
}

const checksum = (sql: string) => createHash("sha256").update(sql).digest("hex");

/**
 * Where the `.sql` files are. The web app runs with `apps/web` as its working
 * directory on every host, while tests and scripts run from the repository
 * root, so both are tried. `MIGRATIONS_DIR` overrides both (useful for a
 * container that copies the SQL somewhere else).
 */
export async function migrationsDirectory(): Promise<string> {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    path.resolve(process.cwd(), "migrations"),
    path.resolve(process.cwd(), "..", "..", "migrations"),
    path.resolve(process.cwd(), "..", "migrations"),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error(
    `Migrations not found. Looked in: ${candidates.join(", ")}. ` +
      "If you deploy without the repository (a standalone build), copy the migrations directory and set MIGRATIONS_DIR.",
  );
}

export async function listMigrationFiles(): Promise<MigrationFile[]> {
  const directory = await migrationsDirectory();
  const names = (await fs.readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  if (names.length === 0) throw new Error(`No .sql migrations in ${directory}`);
  return Promise.all(
    names.map(async (name) => {
      const sql = await fs.readFile(path.join(directory, name), "utf8");
      return { name, sql, checksum: checksum(sql) };
    }),
  );
}

async function readLedger(client: {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
}): Promise<Map<string, string>> {
  const { rows } = await client.query("select name, checksum from schema_migrations");
  return new Map((rows as Array<{ name: string; checksum: string }>).map((row) => [row.name, row.checksum]));
}

async function ensureLedger(client: { query: (sql: string) => Promise<unknown> }): Promise<void> {
  await client.query(`
    create table if not exists schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now(),
      duration_ms integer not null
    )`);
}

/** Read-only view; safe to call on an empty database (it creates only the ledger). */
export async function migrationStatus(): Promise<MigrationStatus> {
  const directory = await migrationsDirectory();
  const files = await listMigrationFiles();
  const applied = await transaction(
    async (client) => {
      await ensureLedger(client);
      return readLedger(client);
    },
    { statementTimeoutMs: 30_000 },
  );
  const pending = files.filter((file) => !applied.has(file.name)).map((file) => file.name);
  const changed = files
    .filter((file) => applied.has(file.name) && applied.get(file.name) !== file.checksum)
    .map((file) => file.name);
  return {
    directory,
    applied: [...applied.keys()].sort(),
    pending,
    changed,
    total: files.length,
  };
}

export interface ApplyResult {
  applied: string[];
  total: number;
  alreadyApplied: number;
  durationMs: number;
}

/**
 * Applies every pending migration in one transaction.
 *
 * One transaction, not one per file: a half-migrated schema is worse than an
 * un-migrated one, and the whole set takes milliseconds. The advisory lock is
 * transaction-scoped, so two instances racing on the same fresh database (two
 * health-check retries, a redeploy) serialise instead of colliding; the loser
 * re-reads the ledger and finds nothing to do.
 */
export async function applyPendingMigrations(): Promise<ApplyResult> {
  const files = await listMigrationFiles();
  const started = Date.now();
  return transaction(
    async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtext('campussphere.schema_migrations'))");
      await ensureLedger(client);
      const applied = await readLedger(client);

      for (const file of files) {
        const previous = applied.get(file.name);
        if (previous && previous !== file.checksum) {
          throw new Error(
            `Migration ${file.name} changed after being applied. Create a new migration instead of editing history.`,
          );
        }
      }

      const pending = files.filter((file) => !applied.has(file.name));
      const appliedNow: string[] = [];
      for (const file of pending) {
        const fileStarted = Date.now();
        await client.query(file.sql);
        await client.query("insert into schema_migrations (name, checksum, duration_ms) values ($1, $2, $3)", [
          file.name,
          file.checksum,
          Date.now() - fileStarted,
        ]);
        appliedNow.push(file.name);
      }
      return {
        applied: appliedNow,
        total: files.length,
        alreadyApplied: files.length - appliedNow.length,
        durationMs: Date.now() - started,
      };
    },
    // Creating indexes on a cold Neon compute can exceed the default 10s.
    { statementTimeoutMs: 120_000 },
  );
}
