#!/usr/bin/env node
/**
 * Dependency-free local load baseline.
 *
 * This is NOT the k6 plan in docs/LOAD_TEST_PLAN.md — it is a small, repeatable
 * check that a single application instance stays healthy under modest
 * concurrency on one machine. Read the numbers as a regression baseline, not as
 * capacity planning: there is no CDN, no connection pooler and no second
 * instance here.
 *
 *   LOAD_BASE_URL=http://127.0.0.1:3000 LOAD_CONCURRENCY=20 LOAD_SECONDS=15 \
 *     node scripts/load.mjs
 */
const base = (process.env.LOAD_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 10);
const seconds = Number(process.env.LOAD_SECONDS ?? 10);
const paths = (process.env.LOAD_PATHS ?? "/,/clubs,/events,/projects,/search?q=robotics,/api/health,/.well-known/security.txt")
  .split(",")
  .map((path) => path.trim())
  .filter(Boolean);

const latencies = [];
const statuses = new Map();
let errors = 0;
let issued = 0;
const deadline = Date.now() + seconds * 1000;

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

async function worker() {
  while (Date.now() < deadline) {
    const path = paths[issued % paths.length];
    issued += 1;
    const started = performance.now();
    try {
      const response = await fetch(base + path, { signal: AbortSignal.timeout(10_000) });
      await response.arrayBuffer();
      statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
      if (response.status >= 500) errors += 1;
    } catch {
      errors += 1;
      statuses.set("network", (statuses.get("network") ?? 0) + 1);
    }
    latencies.push(performance.now() - started);
  }
}

const startedAt = Date.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const elapsed = (Date.now() - startedAt) / 1000;
const sorted = [...latencies].sort((a, b) => a - b);
const round = (value) => Math.round(value * 10) / 10;

console.log(`base=${base} concurrency=${concurrency} duration=${elapsed.toFixed(1)}s requests=${issued}`);
console.log(
  `rps=${(issued / elapsed).toFixed(1)} p50=${round(percentile(sorted, 50))}ms ` +
    `p95=${round(percentile(sorted, 95))}ms p99=${round(percentile(sorted, 99))}ms max=${round(sorted.at(-1) ?? 0)}ms`,
);
console.log(`statuses=${[...statuses].map(([status, count]) => `${status}:${count}`).join(" ")} errors=${errors}`);
if (errors > 0) process.exitCode = 1;
