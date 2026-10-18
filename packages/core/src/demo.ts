import { gunzipSync } from "node:zlib";
import { transaction } from "./db";
import { DEMO_COUNTS, DEMO_SQL_BASE64 } from "./demo.generated";

/**
 * Optional demo catalogue, seeded from the setup URL:
 *
 *   /api/initialize?demo=light
 *
 * Why this lives in the application instead of a CLI: the deployment target is
 * serverless, so whoever deploys often has no shell and no copy of the Neon
 * connection string. Everything this needs — the rows, their order, the schema
 * they fit — travels with the build.
 *
 * The payload is a dump of a scratch database that `scripts/seed-demo.mjs`
 * produced (see `scripts/embed-demo.mjs`), which means the data is known to
 * satisfy every constraint in `migrations/`. Two rules make it safe to expose:
 *
 *  - it refuses to run on a database that already has a catalogue, so a
 *    mistyped URL cannot mix demo rows into a live community;
 *  - it never creates a super-admin, so the first-run window that
 *    `?email=you@university.edu` uses stays open for the real owner.
 */
export { DEMO_COUNTS };

export type DemoSeedResult =
  | { seeded: true; counts: typeof DEMO_COUNTS; durationMs: number }
  | { seeded: false; reason: "already-seeded" | "catalogue-not-empty" };

/** The decoded INSERT statements. Exported so a test can inspect them. */
export function demoSql(): string {
  return gunzipSync(Buffer.from(DEMO_SQL_BASE64, "base64")).toString("utf8");
}

/**
 * Inserts the demo catalogue in one transaction. Safe to call twice: the second
 * call reports why it did nothing. A failure rolls everything back, because a
 * half-populated catalogue is more confusing than an empty one.
 */
export async function seedDemoData(): Promise<DemoSeedResult> {
  const startedAt = Date.now();
  const sql = demoSql();

  return transaction(
    async (client) => {
      const state = await client.query<{ clubs: number; events: number; projects: number; marker: boolean }>(
        `select
           (select count(*) from clubs)::int as clubs,
           (select count(*) from events)::int as events,
           (select count(*) from projects)::int as projects,
           exists (select 1 from settings where key = 'demo') as marker`,
      );
      const row = state.rows[0];

      if (row?.marker) return { seeded: false as const, reason: "already-seeded" as const };
      if ((row?.clubs ?? 0) > 0 || (row?.events ?? 0) > 0 || (row?.projects ?? 0) > 0) {
        return { seeded: false as const, reason: "catalogue-not-empty" as const };
      }

      // One round trip: pg_dump output is a list of independent INSERTs and the
      // simple query protocol accepts them as a single string.
      await client.query(sql);

      await client.query(
        `insert into settings (key, value) values ('demo', $1::jsonb) on conflict (key) do nothing`,
        [JSON.stringify({ ...DEMO_COUNTS, seededAt: new Date().toISOString() })],
      );

      return { seeded: true as const, counts: DEMO_COUNTS, durationMs: Date.now() - startedAt };
    },
    // A sleeping Neon compute plus a thousand statements needs more than the
    // ten-second default, but it is still bounded.
    { statementTimeoutMs: 60_000 },
  );
}
