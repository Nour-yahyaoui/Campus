#!/usr/bin/env node
/**
 * Post-deploy smoke check for public surfaces. No credentials required.
 *
 *   npm run smoke                      # http://localhost:3000
 *   BASE_URL=https://preview npm run smoke
 *   FALLBACK_URL=https://fallback npm run smoke
 *
 * Checks status codes and content markers; prints a table and exits non-zero on
 * the first failed expectation so CI can gate on it.
 */
const base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const fallback = process.env.FALLBACK_URL?.replace(/\/$/, "");

const checks = [
  { path: "/", expect: 200, contains: "CampusSphere" },
  { path: "/clubs", expect: 200, contains: "Clubs" },
  { path: "/events", expect: 200, contains: "Events" },
  { path: "/projects", expect: 200, contains: "Projects" },
  { path: "/search?q=robotics", expect: 200, contains: "Search" },
  { path: "/about", expect: 200, contains: "not verified" },
  { path: "/api/health", expect: 200, contains: '"status":"ok"' },
  { path: "/api/health/live", expect: 200, contains: '"status":"ok"' },
  { path: "/api/health/ready", expect: 200, contains: '"status":"ok"' },
  { path: "/robots.txt", expect: 200, contains: "Sitemap:" },
  { path: "/.well-known/security.txt", expect: 200, contains: "Contact:" },
];

let failures = 0;

async function check(target, label) {
  const started = Date.now();
  try {
    const response = await fetch(`${target.url}${target.path}`, {
      redirect: "manual",
      headers: { "user-agent": "campussphere-smoke/1.0" },
    });
    const body = await response.text();
    const statusOk = response.status === target.expect;
    const contentOk = !target.contains || body.includes(target.contains);
    const ok = statusOk && contentOk;
    if (!ok) failures += 1;
    const ms = Date.now() - started;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${String(response.status).padEnd(3)} ${ms
        .toString()
        .padStart(4)}ms  ${label}${target.path}${contentOk ? "" : `  (missing “${target.contains}”)`}`,
    );
    if (!ok) {
      console.log(`      expected ${target.expect}${target.contains ? ` containing “${target.contains}”` : ""}`);
    }
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ERR       ${label}${target.path}  ${error.message}`);
  }
}

console.log(`Smoke test against ${base}\n`);
for (const target of checks) await check({ ...target, url: base }, "web ");
console.log("      redirect (expected): /dashboard -> /login for anonymous visitors");
const dashboard = await fetch(`${base}/dashboard`, { redirect: "manual" });
const location = dashboard.headers.get("location") ?? "";
if (dashboard.status === 307 || dashboard.status === 308) {
  console.log(`PASS  ${dashboard.status}          web  /dashboard -> ${location}`);
} else {
  failures += 1;
  console.log(`FAIL  ${dashboard.status}          web  /dashboard did not redirect an anonymous visitor`);
}

if (fallback) {
  console.log(`\nFallback API ${fallback}`);
  await check({ url: fallback, path: "/health/live", expect: 200, contains: '"status":"ok"' }, "fallback ");
  await check({ url: fallback, path: "/health/ready", expect: 200, contains: '"status":"ok"' }, "fallback ");
  await check({ url: fallback, path: "/api/v1/clubs", expect: 200, contains: '"data"' }, "fallback ");
  const write = await fetch(`${fallback}/api/v1/clubs`, { method: "POST" });
  const writeOk = write.status === 503;
  if (!writeOk) failures += 1;
  console.log(`${writeOk ? "PASS" : "FAIL"}  ${write.status}          fallback /api/v1/clubs (write refused)`);
}

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
