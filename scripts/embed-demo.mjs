#!/usr/bin/env node
/**
 * Embeds a small demo catalogue into `packages/core/src/demo.generated.ts` so a
 * fresh deployment can be populated by opening one URL instead of running a
 * local script against Neon.
 *
 * Why a dump and not a generator: `scripts/seed-demo.mjs` already produces data
 * that satisfies every constraint in `migrations/` — foreign keys, partial
 * unique indexes, enum values, CHECK bounds. Re-implementing that in TypeScript
 * for the serverless runtime would duplicate the schema knowledge and drift.
 * A dump of a seeded scratch database is the same rows the CLI would insert,
 * gzipped once and committed.
 *
 * Usage (a throwaway database, never production):
 *
 *   createdb campuslight
 *   DATABASE_URL=postgresql://…/campuslight npm run db:migrate
 *   DATABASE_URL=postgresql://…/campuslight node scripts/seed-demo.mjs \
 *     --users=60 --clubs=12 --events=40 --projects=12
 *   DATABASE_URL=postgresql://…/campuslight node scripts/embed-demo.mjs
 *
 * Requires `pg_dump` on PATH, or pass `--from=<file.sql>` with a dump made by:
 *
 *   pg_dump --data-only --inserts --column-inserts --on-conflict-do-nothing \
 *     --table=users --table=clubs … > demo.sql
 *
 * Two safety rules are enforced here rather than trusted to the caller:
 *  - only INSERT statements survive, so the payload cannot alter the schema or
 *    the search_path of a pooled connection;
 *  - the demo super-admin is demoted, so seeding never closes the first-run
 *    window that `/api/initialize?email=…` needs to create the real owner.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "packages", "core", "src", "demo.generated.ts");

// Insert order follows the foreign keys: nothing references a row that has not
// been inserted yet. `settings` is deliberately absent — a demo must not
// overwrite the deployment's real maintenance or registration flags.
const TABLES = [
  "users",
  "clubs",
  "club_memberships",
  "announcements",
  "projects",
  "project_roles",
  "project_members",
  "project_applications",
  "project_tasks",
  "project_milestones",
  "project_updates",
  "events",
  "event_organizers",
  "event_registrations",
  "event_feedback",
  "moderation_reports",
];

const options = new Map();
for (const raw of process.argv.slice(2)) {
  const [key, value = "true"] = raw.replace(/^--/, "").split("=");
  options.set(key, value);
}

let sql;
if (options.has("from")) {
  sql = await readFile(options.get("from"), "utf8");
} else {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL to the scratch database, or pass --from=<dump.sql>.");
    process.exit(1);
  }
  if (/neon\.tech|campus-spheree|vercel/i.test(url) && !options.has("allow-remote")) {
    console.error(
      "That DATABASE_URL looks remote. Point it at a throwaway database, or pass --allow-remote if you are sure.",
    );
    process.exit(1);
  }
  const chunks = [];
  for (const table of TABLES) {
    chunks.push(
      execFileSync(
        "pg_dump",
        [
          "--data-only",
          "--inserts",
          "--column-inserts",
          "--on-conflict-do-nothing",
          "--no-owner",
          "--no-privileges",
          `--table=${table}`,
          url,
        ],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      ),
    );
  }
  sql = chunks.join("\n");
}

// Long descriptions contain real newlines, so an INSERT spans several physical
// lines and only its first line starts with INSERT. Preamble that pg_dump emits
// (SET, set_config, comments) is dropped rather than embedded, because
// `SELECT set_config('search_path', '')` would leak an empty search_path into
// the pooled connection that ran it. Leading whitespace is preserved: inside a
// string literal it is data.
const preamble = /^(SET \w+|SELECT pg_catalog\.set_config\()/i;
const kept = sql
  .split("\n")
  .map((line) => line.replace(/\s+$/, ""))
  .filter((raw) => {
    const line = raw.trim();
    return line !== "" && !line.startsWith("--") && !preamble.test(line);
  });

if (kept.length === 0 || !kept[0]?.startsWith("INSERT INTO ")) {
  console.error("No INSERT statements found — is the scratch database seeded?");
  process.exit(1);
}

// Guard by keyword: any surviving line that *starts* like a statement must be
// one of our INSERTs. Continuation lines are prose and are left alone.
const STATEMENT_KEYWORDS =
  /^(alter|begin|commit|copy|create|delete|do|drop|grant|insert|revoke|rollback|select|set|truncate|update|vacuum)\b/i;
const rejected = [];
for (const raw of kept) {
  const line = raw.trim();
  if (STATEMENT_KEYWORDS.test(line) && !line.startsWith("INSERT INTO ")) rejected.push(line);
}
if (rejected.length > 0) {
  console.error(`Refusing to embed ${rejected.length} unexpected statement(s):`);
  console.error(rejected.slice(0, 5).join("\n").slice(0, 800));
  process.exit(1);
}

// Demote the demo super-admin. Signing in as `admin@campussphere.local` is a
// development-only trick; a production demo still needs the first-run window
// open for the real owner's email.
let demoted = 0;
const cleaned = kept.map((line) => {
  if (!line.includes("INSERT INTO public.users ")) return line;
  return line.replace(/\{student,super_admin\}/g, () => {
    demoted += 1;
    return "{student}";
  });
});
if (demoted === 0) {
  console.error("Expected exactly one demo super-admin row to demote; found none. Refusing to embed.");
  process.exit(1);
}
if (cleaned.join("\n").includes("super_admin")) {
  console.error("A super_admin still appears in the payload. Refusing to embed.");
  process.exit(1);
}

const statement = `${cleaned.join("\n")}\n`;
const compressed = gzipSync(Buffer.from(statement, "utf8"), { level: 9 });

const counts = {
  users: (statement.match(/INSERT INTO public\.users /g) ?? []).length,
  clubs: (statement.match(/INSERT INTO public\.clubs /g) ?? []).length,
  projects: (statement.match(/INSERT INTO public\.projects /g) ?? []).length,
  events: (statement.match(/INSERT INTO public\.events /g) ?? []).length,
  registrations: (statement.match(/INSERT INTO public\.event_registrations /g) ?? []).length,
  memberships: (statement.match(/INSERT INTO public\.club_memberships /g) ?? []).length,
};

const output = `// Generated by scripts/embed-demo.mjs — do not edit by hand.
// Regenerate with the commands in that script's header.
//
// ${counts.users} users · ${counts.clubs} clubs · ${counts.projects} projects · ${counts.events} events · ${counts.memberships} memberships · ${counts.registrations} registrations.
// ${(compressed.length / 1024).toFixed(0)} KiB gzipped, sha256 ${createHash("sha256").update(compressed).digest("hex").slice(0, 16)}.

/** Ordered INSERT statements, gzipped, base64. Decoded by \`seedDemoData\`. */
export const DEMO_SQL_BASE64 = ${JSON.stringify(compressed.toString("base64"))};

/** What the payload contains, for the setup page and for tests. */
export const DEMO_COUNTS = ${JSON.stringify(counts, null, 2)} as const;
`;

await writeFile(target, output, "utf8");
console.log(
  `Wrote ${path.relative(root, target)} — ${kept.length} statements, ${(compressed.length / 1024).toFixed(0)} KiB gzipped, ${demoted} super-admin demoted.`,
);
