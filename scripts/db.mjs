#!/usr/bin/env node
/**
 * Database maintenance CLI.
 *
 *   node scripts/db.mjs migrate   apply pending migrations (checksummed)
 *   node scripts/db.mjs status    show applied/pending migrations
 *   node scripts/db.mjs verify    assert schema invariants used by the app
 *   node scripts/db.mjs reset     drop the public schema and apply every migration (dev only)
 *
 * `reset` leaves a usable, fully migrated schema. It does not seed: demo
 * content is a separate decision (`npm run db:seed`).
 *
 * Any migration already applied is checksum-verified; editing an applied
 * migration is a release error, not a silent divergence between environments.
 */
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "migrations");

async function loadEnv() {
  for (const file of [".env", ".env.local", ".env.development.local"]) {
    try {
      const content = await readFile(path.join(root, file), "utf8");
      for (const raw of content.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
      }
    } catch {
      /* optional file */
    }
  }
}

function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at PostgreSQL\n" +
        "or start the bundled local database with: ./scripts/pg-local.sh start",
    );
    process.exit(2);
  }
  return url;
}

function checksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

async function migrationFiles() {
  const names = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(path.join(migrationsDir, name), "utf8");
      return { name, sql, checksum: checksum(sql) };
    }),
  );
}

async function ensureTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now(),
      duration_ms integer not null
    )`);
}

async function migrate() {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await ensureTable(client);
    const files = await migrationFiles();
    const { rows } = await client.query("select name, checksum from schema_migrations");
    const applied = new Map(rows.map((row) => [row.name, row.checksum]));

    for (const file of files) {
      const previous = applied.get(file.name);
      if (previous && previous !== file.checksum) {
        throw new Error(
          `Migration ${file.name} changed after being applied. ` +
            "Create a new migration instead of editing history.",
        );
      }
    }

    const pending = files.filter((file) => !applied.has(file.name));
    if (pending.length === 0) {
      console.log(`Database is up to date (${files.length} migrations applied).`);
      return;
    }

    for (const file of pending) {
      const started = Date.now();
      await client.query("begin");
      try {
        await client.query(file.sql);
        await client.query(
          "insert into schema_migrations (name, checksum, duration_ms) values ($1, $2, $3)",
          [file.name, file.checksum, Date.now() - started],
        );
        await client.query("commit");
        console.log(`applied ${file.name} (${Date.now() - started}ms)`);
      } catch (error) {
        await client.query("rollback");
        throw new Error(`Migration ${file.name} failed: ${error.message}`);
      }
    }
  } finally {
    await client.end();
  }
}

async function status() {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await ensureTable(client);
    const files = await migrationFiles();
    const { rows } = await client.query(
      "select name, checksum, applied_at from schema_migrations order by name",
    );
    const applied = new Map(rows.map((row) => [row.name, row]));
    let pending = 0;
    for (const file of files) {
      const row = applied.get(file.name);
      if (!row) {
        console.log(`pending  ${file.name}`);
        pending += 1;
      } else if (row.checksum !== file.checksum) {
        console.log(`CHANGED  ${file.name} (applied ${row.applied_at.toISOString?.() ?? row.applied_at})`);
      } else {
        console.log(`applied  ${file.name}`);
      }
    }
    console.log(`\n${files.length - pending}/${files.length} applied, ${pending} pending`);
  } finally {
    await client.end();
  }
}

async function verify() {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  const checks = [];
  const check = (name, ok, detail = "") => checks.push({ name, ok, detail });
  try {
    const migrations = await migrationFiles();
    const { rows } = await client.query("select name from schema_migrations");
    const applied = new Set(rows.map((row) => row.name));
    check(
      "all migrations applied",
      migrations.every((file) => applied.has(file.name)),
      `${applied.size}/${migrations.length}`,
    );

    const tables = await client.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const tableNames = new Set(tables.rows.map((row) => row.table_name));
    for (const required of [
      "users",
      "sessions",
      "clubs",
      "club_memberships",
      "projects",
      "project_applications",
      "events",
      "event_registrations",
      "audit_events",
      "jobs",
      "settings",
    ]) {
      check(`table ${required}`, tableNames.has(required));
    }

    const authTrigger = await client.query(
      `select 1 from information_schema.triggers
       where trigger_name = 'audit_events_append_only' and event_object_table = 'audit_events'`,
    );
    check("audit_events is append-only", authTrigger.rowCount > 0);

    const indexes = await client.query(
      `select indexname from pg_indexes where schemaname = 'public'`,
    );
    const indexNames = new Set(indexes.rows.map((row) => row.indexname));
    check("one active club membership per user", indexNames.has("club_memberships_one_active"));
    check("one active registration per user", indexNames.has("event_registrations_one_active"));

    const settings = await client.query("select count(*)::int as n from settings");
    check("default settings seeded", settings.rows[0].n >= 2, `${settings.rows[0].n} rows`);

    // Security invariant: audit history cannot be rewritten.
    let auditLocked = false;
    try {
      await client.query("begin");
      await client.query(
        "insert into audit_events (action, entity_type, entity_id) values ('system.verify','system','verify')",
      );
      await client.query("update audit_events set action = 'tampered'");
      await client.query("rollback");
    } catch {
      auditLocked = true;
      await client.query("rollback").catch(() => {});
    }
    check("audit rows cannot be modified", auditLocked);

    for (const result of checks) {
      console.log(`${result.ok ? "ok  " : "FAIL"}  ${result.name}${result.detail ? ` (${result.detail})` : ""}`);
    }
    const failed = checks.filter((result) => !result.ok);
    if (failed.length > 0) {
      console.error(`\n${failed.length} verification check(s) failed`);
      process.exitCode = 1;
    } else {
      console.log("\nall database invariants hold");
    }
  } finally {
    await client.end();
  }
}

async function reset() {
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_DB_RESET !== "true") {
    console.error("Refusing to reset. Set ALLOW_DB_RESET=true for a disposable database.");
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query("drop schema public cascade; create schema public;");
    console.log("schema reset");
  } finally {
    await client.end();
  }
  // A reset that leaves an empty schema is a trap: the next command fails with
  // `relation "settings" does not exist`. Re-apply migrations immediately.
  await migrate();
}

await loadEnv();
const command = process.argv[2] ?? "status";
if (command === "migrate") await migrate();
else if (command === "status") await status();
else if (command === "verify") await verify();
else if (command === "reset") await reset();
else {
  console.error(`unknown command: ${command}`);
  process.exit(1);
}
