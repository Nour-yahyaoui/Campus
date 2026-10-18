import type { Metadata } from "next";
import { observatorySnapshot } from "@campussphere/core";
import { requireSuperAdmin } from "@/lib/session";
import { bytes, formatDateTime, numeric, percent, titleCase } from "@/lib/format";
import { Notice, Tag } from "@/components/Pieces";
import { RefreshButton } from "@/components/RefreshButton";

export const metadata: Metadata = { title: "System Observatory", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ObservatoryPage() {
  await requireSuperAdmin("/observatory");
  const snapshot = await observatorySnapshot();

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Operations</p>
        <h1>System Observatory</h1>
        <p className="lede">
          Measured on this instance at {formatDateTime(snapshot.generatedAt)}. Each number either comes
          from a query, from the Node process, or is listed as unavailable with a reason.
        </p>
        <div className="mt-2">
          <RefreshButton label="Refresh snapshot" updatedAt={snapshot.generatedAt} />
        </div>
      </div>

      <Notice tone="neutral">
        Environment <strong>{snapshot.environment}</strong> · window {snapshot.api.windowMinutes} min ·{" "}
        {snapshot.database.migrationsApplied} migrations applied
        {snapshot.database.lastMigrationAt ? ` · last ${formatDateTime(snapshot.database.lastMigrationAt)}` : ""}.
        Fallback API status, host CPU/memory and Redis are reported as unavailable below rather than invented.
      </Notice>

      <section className="section" style={{ paddingTop: 12 }}>
        <div className="section-head"><h2 style={{ fontSize: "1.5rem" }}>Product</h2></div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Metric</th><th>Value</th><th>Definition</th></tr></thead>
            <tbody>
              {snapshot.product.map((metric) => (
                <tr key={metric.key}>
                  <td>{metric.label}<div className="tiny muted mono">{metric.key}</div></td>
                  <td><strong>{metric.value === null ? "unavailable" : numeric(metric.value)}</strong></td>
                  <td className="small muted">{metric.definition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 style={{ fontSize: "1.5rem" }}>API requests</h2>
          <span className="small muted">last {snapshot.api.windowMinutes} minutes</span>
        </div>
        <div className="stat-row">
          <div className="mini-stat"><b>{numeric(snapshot.api.requests)}</b><span>Requests</span></div>
          <div className="mini-stat"><b>{numeric(snapshot.api.errors)}</b><span>Responses ≥400</span></div>
          <div className="mini-stat"><b>{percent(snapshot.api.errorRate)}</b><span>Error rate</span></div>
          <div className="mini-stat"><b>{snapshot.api.p95Ms ?? "—"}</b><span>p95 latency (ms)</span></div>
        </div>
        <div className="table-wrap mt-2">
          <table className="data">
            <thead><tr><th>Route template</th><th>Requests</th><th>Errors</th><th>p95</th></tr></thead>
            <tbody>
              {snapshot.api.byRoute.length === 0 ? (
                <tr><td colSpan={4} className="small muted">No API requests recorded in the window. Web page renders are not counted; JSON API calls are.</td></tr>
              ) : (
                snapshot.api.byRoute.map((route) => (
                  <tr key={route.route}>
                    <td className="mono">{route.route}</td>
                    <td>{numeric(route.requests)}</td>
                    <td>{numeric(route.errors)}</td>
                    <td>{route.p95Ms === null ? "—" : `${route.p95Ms} ms`}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="tiny muted mt-1">
          p50 {snapshot.api.p50Ms ?? "—"} ms · p99 {snapshot.api.p99Ms ?? "—"} ms · auth failures{" "}
          {snapshot.api.authFailures} · rate-limited {snapshot.api.rateLimited}. Samples are retained for{" "}
          {process.env.METRICS_RETENTION_DAYS ?? 30} days by the maintenance job.
        </p>
      </section>

      <div className="dash-grid">
        <section className="card">
          <h2 style={{ fontSize: "1.2rem" }}>Node process</h2>
          <dl className="fact-list">
            <div className="fact"><dt>Uptime</dt><dd>{Math.round(snapshot.runtime.uptimeSeconds / 60)} minutes</dd></div>
            <div className="fact"><dt>Node</dt><dd>{snapshot.runtime.nodeVersion} · pid {snapshot.runtime.pid}</dd></div>
            <div className="fact"><dt>RSS</dt><dd>{bytes(snapshot.runtime.rssBytes)}</dd></div>
            <div className="fact"><dt>Heap used</dt><dd>{bytes(snapshot.runtime.heapUsedBytes)} of {bytes(snapshot.runtime.heapTotalBytes)}</dd></div>
            <div className="fact"><dt>CPU time</dt><dd>{Math.round((snapshot.runtime.cpuUserMicros + snapshot.runtime.cpuSystemMicros) / 1000)} ms</dd></div>
          </dl>
        </section>

        <section className="card">
          <h2 style={{ fontSize: "1.2rem" }}>Database</h2>
          <dl className="fact-list">
            <div className="fact"><dt>Pool</dt><dd>{snapshot.database.poolTotal} total · {snapshot.database.poolIdle} idle · {snapshot.database.poolWaiting} waiting</dd></div>
            <div className="fact"><dt>Server sessions</dt><dd>{snapshot.database.activeConnections ?? "unavailable"} active of {snapshot.database.maxConnections ?? "unknown"} max</dd></div>
            <div className="fact"><dt>Size</dt><dd>{bytes(snapshot.database.databaseSizeBytes)}</dd></div>
            <div className="fact"><dt>Migrations</dt><dd>{snapshot.database.migrationsApplied} applied</dd></div>
          </dl>
        </section>

        <section className="card">
          <h2 style={{ fontSize: "1.2rem" }}>Durable jobs</h2>
          <dl className="fact-list">
            <div className="fact"><dt>Queued</dt><dd>{snapshot.jobs.queued}</dd></div>
            <div className="fact"><dt>Running</dt><dd>{snapshot.jobs.running}</dd></div>
            <div className="fact"><dt>Dead</dt><dd>{snapshot.jobs.dead}</dd></div>
            <div className="fact"><dt>Oldest queued</dt><dd>{snapshot.jobs.oldestQueuedAt ? formatDateTime(snapshot.jobs.oldestQueuedAt) : "—"}</dd></div>
          </dl>
          <p className="hint">
            The worker is not started automatically by the web process. In production it runs as a
            separate service; locally, <span className="mono">node scripts/worker.mjs</span> drains it.
          </p>
        </section>

        <section className="card">
          <h2 style={{ fontSize: "1.2rem" }}>Email</h2>
          <Tag tone={snapshot.email.configured ? "forest" : "marigold"}>
            {snapshot.email.configured ? "Configured" : "Not delivering"}
          </Tag>
          <p className="small" style={{ marginTop: 8 }}>{snapshot.email.note}</p>
          <dl className="fact-list">
            <div className="fact"><dt>Sent (24h)</dt><dd>{snapshot.email.sentLast24h ?? "unavailable"}</dd></div>
            <div className="fact"><dt>Failed (24h)</dt><dd>{snapshot.email.failedLast24h ?? "unavailable"}</dd></div>
          </dl>
        </section>
      </div>

      <section className="section">
        <div className="section-head"><h2 style={{ fontSize: "1.5rem" }}>Explicitly unavailable</h2></div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Source</th><th>Why it is not shown</th></tr></thead>
            <tbody>
              {snapshot.unavailable.map((entry) => (
                <tr key={entry.key}>
                  <td className="mono">{entry.key}</td>
                  <td className="small">{entry.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted mt-1">Nothing on this page is seeded sample data; empty windows render as zeros.</p>
      </section>
    </>
  );
}
