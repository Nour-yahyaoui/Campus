/**
 * Server health shown on the super-admin dashboard.
 *
 * Both shapes are deliberately explicit about what could not be measured: a
 * field is `null` only when the value genuinely does not exist or was not
 * reported, never to stand in for a guess.
 */

export type ServerRole = "primary" | "fallback";

export type ServerStatus =
  /** Answering and reporting metrics. */
  | "online"
  /** Answering, but without the detailed metrics endpoint (an older build). */
  | "degraded"
  /** Configured but did not answer. */
  | "offline"
  /** No address is configured, so there is nothing to probe. */
  | "not_configured";

export type LoadLevel = "warming" | "idle" | "light" | "moderate" | "heavy" | "unknown";

export interface ServerMemory {
  rssBytes: number;
  /** High-water mark, where the kernel exposes it. */
  peakRssBytes: number | null;
  heapUsedBytes: number | null;
  heapTotalBytes: number | null;
  /** Container/function limit, when the platform exposes it. */
  limitBytes: number | null;
}

export interface ServerCpu {
  /** Percent of a single core, as `top` reports it (can exceed 100). */
  percent: number | null;
  /** Percent of the capacity this process can actually use. */
  loadPercent: number | null;
  cores: number;
  load1: number | null;
  load5: number | null;
  load15: number | null;
}

export interface ServerNode {
  role: ServerRole;
  name: string;
  runtime: string;
  url: string | null;
  status: ServerStatus;
  /** One sentence explaining the status, in plain words. */
  detail: string;
  /** Round-trip time of the probe that produced this snapshot. */
  latencyMs: number | null;
  version: string | null;
  uptimeSeconds: number | null;
  memory: ServerMemory | null;
  cpu: ServerCpu | null;
  database: { ready: boolean; migrations: number | null; latencyMs: number | null } | null;
  load: { level: LoadLevel; reason: string };
  /** Short measured facts that do not deserve their own field. */
  facts: Array<{ label: string; value: string }>;
}

export interface SystemSnapshot {
  generatedAt: string;
  environment: string;
  /** Which node answers the product's own pages and `/api/*` calls. */
  serving: ServerRole;
  traffic: {
    windowMinutes: number;
    requests: number;
    errors: number;
    p95Ms: number | null;
    perMinute: number;
  };
  nodes: { primary: ServerNode; fallback: ServerNode };
  /** Caveats about what these numbers do and do not cover. */
  notes: string[];
}
