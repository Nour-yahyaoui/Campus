import { MIN_LATENCY_SAMPLES } from "@campussphere/contracts";
import type { LoadLevel, ServerCpu, ServerMemory } from "@campussphere/contracts";

/**
 * Turning measurements into a verdict.
 *
 * The rules are deliberately simple and every verdict names the signal that
 * produced it. A dashboard that says "under load" without saying *why* is
 * worse than no dashboard: it teaches people to ignore it.
 */

export interface LoadSignals {
  /**
   * Percent of the capacity this process can actually use. For the Node
   * server that is one core (it runs JavaScript on one thread); for Actix it
   * is every core, so the caller divides by the core count first.
   */
  cpuLoadPercent: number | null;
  eventLoopP99Ms?: number | null;
  poolWaiting?: number | null;
  p95Ms?: number | null;
  /**
   * How many requests the p95 was computed from. A percentile over a dozen
   * cold requests is noise dressed as a trend.
   */
  sampleRequests?: number | null;
  /** Age of the process. A cold start is not load. */
  uptimeSeconds?: number | null;
}

/** Below this age, the process is still paying startup costs. */
export const MIN_LOAD_UPTIME_SECONDS = 30;
/** Below this sample count, latency percentiles are not a trend. */
export { MIN_LATENCY_SAMPLES };

export interface LoadVerdict {
  level: LoadLevel;
  reason: string;
}

const round = (value: number): number => Math.round(value * 10) / 10;

export function classifyLoad(signals: LoadSignals): LoadVerdict {
  const cpu = signals.cpuLoadPercent;
  const loop = signals.eventLoopP99Ms ?? null;
  const waiting = signals.poolWaiting ?? null;
  const uptime = signals.uptimeSeconds ?? null;
  const samples = signals.sampleRequests ?? null;
  const rawP95 = signals.p95Ms ?? null;
  // Latency only counts once there are enough requests to mean anything.
  const p95 = rawP95 !== null && (samples === null || samples >= MIN_LATENCY_SAMPLES) ? rawP95 : null;

  if (uptime !== null && uptime < MIN_LOAD_UPTIME_SECONDS) {
    return {
      level: "warming",
      reason: `This instance is ${Math.max(1, Math.round(uptime))} s old. Cold-start work is not load; the verdict begins at ${MIN_LOAD_UPTIME_SECONDS} s.`,
    };
  }

  if (cpu === null && loop === null && waiting === null && p95 === null) {
    return {
      level: "unknown",
      reason: "No samples yet. This panel fills in after the second refresh.",
    };
  }

  if (waiting !== null && waiting > 0) {
    return {
      level: "heavy",
      reason: `${waiting} request${waiting === 1 ? "" : "s"} waiting for a database connection.`,
    };
  }
  if (cpu !== null && cpu >= 85) {
    return { level: "heavy", reason: `CPU is at ${round(cpu)}% of this server's capacity.` };
  }
  if (loop !== null && loop >= 150) {
    return { level: "heavy", reason: `The event loop stalls for ${round(loop)} ms at the 99th percentile.` };
  }
  if (p95 !== null && p95 >= 1_500) {
    return { level: "heavy", reason: `API responses take ${p95} ms at the 95th percentile.` };
  }

  if (cpu !== null && cpu >= 55) {
    return { level: "moderate", reason: `CPU is at ${round(cpu)}% of this server's capacity.` };
  }
  if (loop !== null && loop >= 60) {
    return { level: "moderate", reason: `Event-loop delay is ${round(loop)} ms at the 99th percentile.` };
  }
  if (p95 !== null && p95 >= 700) {
    return { level: "moderate", reason: `API responses take ${p95} ms at the 95th percentile.` };
  }

  if (cpu !== null && cpu >= 20) {
    return { level: "light", reason: `CPU is at ${round(cpu)}% of this server's capacity.` };
  }
  if (p95 !== null && p95 >= 250) {
    return { level: "light", reason: `API responses take ${p95} ms at the 95th percentile.` };
  }
  if (loop !== null && loop >= 25) {
    return { level: "light", reason: `Event-loop delay is ${round(loop)} ms at the 99th percentile.` };
  }

  const measured: string[] = [];
  if (cpu !== null) measured.push(`CPU ${round(cpu)}%`);
  if (loop !== null) measured.push(`event loop ${round(loop)} ms`);
  if (p95 !== null) measured.push(`API p95 ${p95} ms`);
  return {
    level: "idle",
    reason: measured.length > 0 ? `${measured.join(" · ")}. Nothing is queued.` : "Nothing is queued.",
  };
}

/* ------------------------------------------------------------------ */
/* Parsing the primary API's /health/metrics payload                   */
/* ------------------------------------------------------------------ */

export interface PrimaryMetrics {
  version: string | null;
  uptimeSeconds: number | null;
  memory: ServerMemory | null;
  cpu: ServerCpu | null;
  database: { ready: boolean; migrations: number | null; latencyMs: number | null } | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asInteger(value: unknown): number | null {
  const number = asNumber(value);
  return number === null ? null : Math.round(number);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Reads the Rust service's metrics document defensively: a newer or older
 * build must never crash the dashboard, and a field that is missing stays
 * missing rather than becoming a zero.
 */
export function normalisePrimaryPayload(raw: unknown): PrimaryMetrics | null {
  const root = asRecord(raw);
  if (!root) return null;
  const service = asString(root.service);
  if (service !== "campussphere-rust-api") return null;

  const memoryRaw = asRecord(root.memory);
  const rss = asNumber(memoryRaw?.rssBytes);
  const memory: ServerMemory | null =
    rss === null || rss < 0
      ? null
      : {
          rssBytes: Math.round(rss),
          peakRssBytes: asInteger(memoryRaw?.peakRssBytes),
          heapUsedBytes: null,
          heapTotalBytes: null,
          limitBytes: asInteger(memoryRaw?.limitBytes),
        };

  const cpuRaw = asRecord(root.cpu);
  const percent = asNumber(cpuRaw?.percent);
  const cores = Math.max(1, asInteger(cpuRaw?.cores) ?? 1);
  const cpu: ServerCpu | null =
    cpuRaw === null
      ? null
      : {
          percent: percent === null ? null : round(percent),
          // Actix runs on every core it is given, so its capacity is
          // `cores × 100%`; the Node server's is a single core.
          loadPercent: percent === null ? null : round(Math.min(100, percent / cores)),
          cores,
          load1: asNumber(cpuRaw.load1),
          load5: asNumber(cpuRaw.load5),
          load15: asNumber(cpuRaw.load15),
        };

  const databaseRaw = asRecord(root.database);
  const database =
    databaseRaw === null
      ? null
      : {
          ready: databaseRaw.ready === true,
          migrations: asInteger(databaseRaw.migrations),
          latencyMs: asInteger(databaseRaw.latencyMs),
        };

  return {
    version: asString(root.version),
    uptimeSeconds: asInteger(root.uptimeSeconds),
    memory,
    cpu,
    database,
  };
}
