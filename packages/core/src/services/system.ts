import os from "node:os";
import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import type {
  ServerCpu,
  ServerMemory,
  ServerNode,
  SystemSnapshot,
} from "@campussphere/contracts";
import { getEnv, type Env } from "../env";
import { getPool, one } from "../db";
import { classifyLoad, normalisePrimaryPayload } from "../load";

/**
 * Server health for the super-admin dashboard.
 *
 * Two very different things are measured here and the panel says so:
 *
 *  - The Next.js process reading this request. Everything is local, so it is
 *    measured directly: RSS, heap, CPU time, event-loop delay, pool state.
 *  - The optional Actix service, over the network, at `API_BASE_URL`. If it is
 *    absent or asleep there is no number to show, and none is invented.
 *
 * On Vercel every function instance has its own process, so the figures below
 * describe the instance that answered this request — not a fleet total. The
 * panel repeats that caveat instead of letting a reader assume otherwise.
 */

const PROBE_TIMEOUT_MS = 2_500;
const PROBE_CACHE_MS = 4_000;
const MIB = 1024 * 1024;

const round = (value: number): number => Math.round(value * 10) / 10;
const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

/**
 * The sampler's own resolution is the floor of what it can report, so 10 ms is
 * the smallest number the panel will ever show on an idle loop. At that
 * resolution 150 samples is about a second and a half of observation: below
 * it, the "99th percentile" is just the worst of a handful of readings.
 */
const LOOP_RESOLUTION_MS = 10;
const MIN_LOOP_SAMPLES = 150;

let histogram: IntervalHistogram | null = null;
let lastCpu: { usage: NodeJS.CpuUsage; at: number; percent: number | null } | null = null;

/**
 * Event-loop delay over the window since the last read, not since boot.
 *
 * A cumulative histogram is poisoned by startup: one 9 s stall while modules
 * load stays the p99 for the life of the process, and a cold start is reported
 * as "under load" forever. Resetting on every read makes the figure mean
 * "how blocked was the loop recently".
 */
function eventLoopWindow(): { p99Ms: number | null; samples: number } {
  if (!histogram) {
    histogram = monitorEventLoopDelay({ resolution: LOOP_RESOLUTION_MS });
    histogram.enable();
    return { p99Ms: null, samples: 0 };
  }
  const samples = histogram.count;
  const raw = samples > 0 ? histogram.percentile(99) / 1e6 : 0;
  histogram.reset();
  const trustworthy = samples >= MIN_LOOP_SAMPLES && Number.isFinite(raw);
  return { p99Ms: trustworthy ? round(raw) : null, samples };
}

function processCpuPercent(): number | null {
  const at = performance.now();
  const usage = process.cpuUsage();
  const previous = lastCpu;

  if (previous) {
    const elapsed = at - previous.at;
    if (elapsed < 200) return previous.percent;
    const used = usage.user + usage.system - (previous.usage.user + previous.usage.system);
    const percent = clampPercent(round((used / 1000 / elapsed) * 100));
    lastCpu = { usage, at, percent };
    return percent;
  }

  // First call after a cold start: average over the life of the process.
  const uptimeMs = process.uptime() * 1000;
  if (uptimeMs < 500) {
    lastCpu = { usage, at, percent: null };
    return null;
  }
  const percent = clampPercent(round(((usage.user + usage.system) / 1000 / uptimeMs) * 100));
  lastCpu = { usage, at, percent };
  return percent;
}

function memoryLimitBytes(env: Env): number | null {
  const constrained =
    typeof process.constrainedMemory === "function" ? process.constrainedMemory() : 0;
  if (constrained && constrained > 0) return constrained;
  if (env.SERVER_MEMORY_LIMIT_MB) return env.SERVER_MEMORY_LIMIT_MB * MIB;
  return null;
}

function usableCores(): number {
  if (typeof os.availableParallelism === "function") return Math.max(1, os.availableParallelism());
  return Math.max(1, os.cpus().length);
}

function trafficQuery(): Promise<SystemSnapshot["traffic"]> {
  return one<{ requests: number; errors: number; p95: number | string | null }>(
    `select count(*)::int as requests,
            count(*) filter (where status_code >= 400)::int as errors,
            percentile_cont(0.95) within group (order by duration_ms) as p95
       from api_metrics
      where created_at > now() - interval '5 minutes'`,
  )
    .then((row) => {
      const requests = Number(row?.requests ?? 0);
      const p95 = row?.p95 === null || row?.p95 === undefined ? null : Math.round(Number(row.p95));
      return {
        windowMinutes: 5,
        requests,
        errors: Number(row?.errors ?? 0),
        p95Ms: p95,
        perMinute: round(requests / 5),
      };
    });
}

/* ------------------------------------------------------------------ */
/* The Next.js server answering this request                           */
/* ------------------------------------------------------------------ */

function fallbackNode(traffic: SystemSnapshot["traffic"], env: Env, databaseReady: boolean): ServerNode {
  const usage = process.memoryUsage();
  const cpuPercent = processCpuPercent();
  const loopWindow = eventLoopWindow();
  const loop = loopWindow.p99Ms;
  const uptimeSeconds = process.uptime();
  const pool = getPool();
  const load = os.loadavg();
  const load1 = load[0] ?? 0;
  const load5 = load[1] ?? 0;
  const load15 = load[2] ?? 0;
  const limit = memoryLimitBytes(env);

  const memory: ServerMemory = {
    rssBytes: usage.rss,
    peakRssBytes: null,
    heapUsedBytes: usage.heapUsed,
    heapTotalBytes: usage.heapTotal,
    limitBytes: limit,
  };

  const cpu: ServerCpu = {
    percent: cpuPercent,
    // Node runs the application on one thread, so one core is its capacity.
    loadPercent: cpuPercent,
    cores: usableCores(),
    load1: round(load1),
    load5: round(load5),
    load15: round(load15),
  };

  const verdict = classifyLoad({
    cpuLoadPercent: cpuPercent,
    eventLoopP99Ms: loop,
    poolWaiting: pool.waitingCount,
    p95Ms: traffic.p95Ms,
    sampleRequests: traffic.requests,
    uptimeSeconds,
  });

  const facts: Array<{ label: string; value: string }> = [];
  facts.push({
    label: "event loop p99",
    value: loop !== null ? `${round(loop)} ms` : "collecting",
  });
  facts.push({
    label: "db pool",
    value: `${pool.totalCount} open · ${pool.waitingCount} waiting`,
  });
  facts.push({
    label: "heap",
    value: `${(usage.heapUsed / MIB).toFixed(0)} of ${(usage.heapTotal / MIB).toFixed(0)} MB`,
  });

  return {
    role: "fallback",
    name: "Next.js",
    runtime: `Node ${process.version}`,
    url: env.NEXT_PUBLIC_SITE_URL,
    status: databaseReady ? "online" : "degraded",
    detail: databaseReady
      ? "This deployment. It renders every page and answers /api/*."
      : "This deployment is up, but its database query failed.",
    latencyMs: null,
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
    uptimeSeconds: Math.round(uptimeSeconds),
    memory,
    cpu,
    database: databaseReady
      ? { ready: true, migrations: null, latencyMs: null }
      : { ready: false, migrations: null, latencyMs: null },
    load: verdict,
    facts,
  };
}

/* ------------------------------------------------------------------ */
/* The optional Actix primary API                                      */
/* ------------------------------------------------------------------ */

let primaryCache: { at: number; base: string; node: ServerNode } | null = null;

function primaryNode(partial: Pick<ServerNode, "status" | "detail"> & Partial<ServerNode>): ServerNode {
  return {
    role: "primary",
    name: "Actix API",
    runtime: "Rust · Actix Web",
    url: null,
    latencyMs: null,
    version: null,
    uptimeSeconds: null,
    memory: null,
    cpu: null,
    database: null,
    facts: [],
    ...partial,
    load: partial.load ?? classifyLoad({ cpuLoadPercent: null }),
  };
}

function describeFailure(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    const name = String((error as { name: unknown }).name);
    if (name === "TimeoutError" || name === "AbortError") {
      // Free-tier hosts sleep. A first probe that times out has still woken the
      // service, so the next poll usually succeeds; say that instead of "down".
      return `No answer within ${PROBE_TIMEOUT_MS / 1_000} s. A sleeping free-tier instance can take a minute to wake, and this panel retries every 10 s.`;
    }
  }
  const message = error instanceof Error ? error.message : "The request failed.";
  return message.length > 140 ? `${message.slice(0, 140)}…` : message;
}

async function probePrimary(env: Env): Promise<ServerNode> {
  const base = env.API_BASE_URL;
  if (!base) {
    return primaryNode({
      status: "not_configured",
      detail:
        "API_BASE_URL is not set for this environment, so there is no separate service to probe.",
    });
  }

  try {
    if (new URL(base).origin === new URL(env.NEXT_PUBLIC_SITE_URL).origin) {
      return primaryNode({
        status: "not_configured",
        detail: "API_BASE_URL points at this deployment, so there is nothing separate to probe.",
      });
    }
  } catch {
    /* env validation already guarantees a URL */
  }

  if (primaryCache && primaryCache.base === base && Date.now() - primaryCache.at < PROBE_CACHE_MS) {
    return primaryCache.node;
  }

  const headers: Record<string, string> = { accept: "application/json" };
  if (env.METRICS_TOKEN) headers.authorization = `Bearer ${env.METRICS_TOKEN}`;

  const started = performance.now();
  let response: Response | null = null;
  let failure = "";
  try {
    response = await fetch(new URL("/health/metrics", base), {
      headers,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch (error) {
    failure = describeFailure(error);
  }
  const latencyMs = Math.round(performance.now() - started);

  if (response?.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const metrics = normalisePrimaryPayload(payload);
    if (!metrics) {
      const node = primaryNode({
        status: "degraded",
        detail: "The primary answered, but with a document this dashboard cannot read.",
        latencyMs,
        url: base,
      });
      primaryCache = { at: Date.now(), base, node };
      return node;
    }

    const load = classifyLoad({
      cpuLoadPercent: metrics.cpu?.loadPercent ?? null,
      uptimeSeconds: metrics.uptimeSeconds,
    });
    const facts: Array<{ label: string; value: string }> = [];
    const load1 = metrics.cpu?.load1 ?? null;
    if (load1 !== null) facts.push({ label: "load 1m", value: load1.toFixed(2) });
    const dbPing = metrics.database?.latencyMs ?? null;
    if (dbPing !== null) facts.push({ label: "db ping", value: `${dbPing} ms` });
    const migrations = metrics.database?.migrations ?? null;
    if (migrations !== null) facts.push({ label: "migrations", value: String(migrations) });

    const databaseDown = metrics.database !== null && !metrics.database.ready;
    const node = primaryNode({
      status: databaseDown ? "degraded" : "online",
      detail: databaseDown
        ? `Answered in ${latencyMs} ms, but its database ping failed.`
        : `Answered in ${latencyMs} ms. The site does not route through it yet.`,
      url: base,
      latencyMs,
      version: metrics.version,
      uptimeSeconds: metrics.uptimeSeconds,
      memory: metrics.memory,
      cpu: metrics.cpu,
      database: metrics.database,
      load,
      facts,
    });
    primaryCache = { at: Date.now(), base, node };
    return node;
  }

  if (response && (response.status === 401 || response.status === 403)) {
    return primaryNode({
      status: "offline",
      detail: `The primary answered ${response.status}. Set METRICS_TOKEN to the same value on both services.`,
      url: base,
      latencyMs,
    });
  }

  if (response && response.status === 404) {
    // An older build without the metrics route: prove it is alive, then say so.
    try {
      const live = await fetch(new URL("/health/live", base), {
        headers,
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
      if (live.ok) {
        return primaryNode({
          status: "degraded",
          detail: "The primary is alive, but this build does not expose /health/metrics.",
          url: base,
          latencyMs,
        });
      }
    } catch {
      /* fall through to offline */
    }
  }

  const detail = response
    ? `The primary answered ${response.status}.`
    : failure || "The primary did not answer.";
  return primaryNode({ status: "offline", detail, url: base, latencyMs });
}

/* ------------------------------------------------------------------ */

export async function systemSnapshot(): Promise<SystemSnapshot> {
  const env = getEnv();
  const [primary, trafficRow] = await Promise.all([probePrimary(env), trafficResult()]);
  const fallback = fallbackNode(trafficRow.traffic, env, trafficRow.databaseReady);

  return {
    generatedAt: new Date().toISOString(),
    environment: env.APP_ENV,
    serving: "fallback",
    traffic: trafficRow.traffic,
    nodes: { primary, fallback },
    notes: [
      "Next.js renders every page and /api/* call. The Actix service is the optional read API at /api/v1/*; it is not in this dashboard's request path.",
      "On Vercel each function instance reports its own memory. These are the numbers for the instance that answered this request, not a fleet total.",
      "Load average is the host's, not the container's, on shared platforms; CPU and memory are the process's own.",
      "The event-loop figure is a rolling window, reset on every reading. It needs 150 samples before it is shown, and no verdict is issued for the first 30 seconds of a process.",
    ],
  };
}

async function trafficResult(): Promise<{
  traffic: SystemSnapshot["traffic"];
  databaseReady: boolean;
}> {
  try {
    const traffic = await trafficQuery();
    return { traffic, databaseReady: true };
  } catch {
    return {
      traffic: { windowMinutes: 5, requests: 0, errors: 0, p95Ms: null, perMinute: 0 },
      databaseReady: false,
    };
  }
}
