"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MIN_LATENCY_SAMPLES } from "@campussphere/contracts";
import type { LoadLevel, ServerNode, SystemSnapshot } from "@campussphere/contracts";
import { bytes } from "@/lib/format";

/**
 * Live server health.
 *
 * Two processes are shown side by side: the optional Actix primary API and the
 * Next.js deployment answering this page. It refreshes itself every ten
 * seconds while the tab is visible, keeps the previous reading on screen when a
 * poll fails, and never displays a number it did not receive.
 */

const POLL_MS = 10_000;
const HISTORY_LENGTH = 24;

type Sample = { rss: number; cpu: number | null };

const STATUS_WORD: Record<ServerNode["status"], string> = {
  online: "Online",
  degraded: "Limited",
  offline: "Down",
  not_configured: "Not set",
};

const LOAD_WORD: Record<LoadLevel, string> = {
  warming: "Warming up",
  idle: "Idle",
  light: "Light",
  moderate: "Busy",
  heavy: "Under load",
  unknown: "No data",
};

function uptime(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min`;
  const days = Math.floor(hours / 24);
  return `${days} d ${hours % 24} h`;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const span = Math.max(max - min, max * 0.05, 1);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 24 - ((value - min) / span) * 20;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      className="srv-spark"
      viewBox="0 0 100 26"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function meterTone(percent: number): "ok" | "warn" | "danger" {
  if (percent >= 85) return "danger";
  if (percent >= 60) return "warn";
  return "ok";
}

function NodeCard({ node, history }: { node: ServerNode; history?: number[] }) {
  const memoryPercent =
    node.memory?.limitBytes && node.memory.limitBytes > 0
      ? Math.min(100, (node.memory.rssBytes / node.memory.limitBytes) * 100)
      : null;
  const cpu = node.cpu?.percent ?? null;

  return (
    <article className={`srv-node srv-node-${node.status}`}>
      <header className="srv-node-head">
        <div>
          <span className="srv-role">{node.role === "primary" ? "Primary" : "Fallback"}</span>
          <h3>{node.name}</h3>
          <p className="tiny muted">{node.runtime}</p>
        </div>
        <span className={`srv-pill srv-pill-${node.status}`}>
          <span className="srv-dot" aria-hidden="true" />
          {STATUS_WORD[node.status]}
        </span>
      </header>

      <p className="tiny muted srv-node-detail">
        {node.detail}
        {node.version ? <> · v{node.version}</> : null}
        {node.uptimeSeconds !== null ? <> · up {uptime(node.uptimeSeconds)}</> : null}
      </p>

      {node.memory || node.cpu ? (
      <div className="srv-stats">
        <div>
          <span className="srv-stat-label">Memory</span>
          <strong className="srv-stat-value">
            {node.memory ? bytes(node.memory.rssBytes) : "—"}
          </strong>
          <span className="tiny muted">
            {node.memory?.limitBytes
              ? `of ${bytes(node.memory.limitBytes)}`
              : node.memory?.peakRssBytes
                ? `peak ${bytes(node.memory.peakRssBytes)}`
                : "limit not reported"}
          </span>
        </div>
        <div>
          <span className="srv-stat-label">CPU</span>
          <strong className="srv-stat-value">{cpu === null ? "—" : `${cpu.toFixed(0)}%`}</strong>
          <span className="tiny muted">
            {node.role === "primary" ? `${node.cpu?.cores ?? 1} cores` : "one core"}
          </span>
        </div>
        <div>
          <span className="srv-stat-label">Uptime</span>
          <strong className="srv-stat-value">{uptime(node.uptimeSeconds)}</strong>
          <span className="tiny muted">
            {node.latencyMs !== null ? `${node.latencyMs} ms to answer` : "this instance"}
          </span>
        </div>
      </div>
      ) : null}

      {memoryPercent !== null ? (
        <div
          className="srv-meter"
          data-tone={meterTone(memoryPercent)}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(memoryPercent)}
          aria-label={`${node.name} memory: ${bytes(node.memory?.rssBytes ?? 0)} of ${bytes(
            node.memory?.limitBytes ?? 0,
          )}`}
        >
          <span style={{ width: `${memoryPercent}%` }} />
        </div>
      ) : null}

      {history && history.length > 1 ? (
        <div className="srv-history">
          <Sparkline values={history} />
          <span className="tiny muted">resident memory, last {history.length} readings</span>
        </div>
      ) : null}

      {node.status === "online" || node.status === "degraded" ? (
        <div className="srv-load">
          <span className={`srv-load-chip load-${node.load.level}`}>
            <span className="srv-load-dot" aria-hidden="true" />
            {LOAD_WORD[node.load.level]}
          </span>
          <span className="tiny muted">{node.load.reason}</span>
        </div>
      ) : null}

      {node.facts.length > 0 ? (
        <dl className="srv-facts">
          {node.facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}

function PanelSkeleton() {
  return (
    <div className="srv-grid" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Measuring server health…</span>
      {[0, 1].map((index) => (
        <div className="srv-node" key={index} aria-hidden="true">
          <span className="skeleton" style={{ display: "block", width: 64, height: 10 }} />
          <span className="skeleton" style={{ display: "block", width: "46%", height: 22, marginTop: 8 }} />
          <span className="skeleton" style={{ display: "block", width: "82%", height: 10, marginTop: 10 }} />
          <span className="skeleton" style={{ display: "block", width: "100%", height: 42, marginTop: 16 }} />
          <span className="skeleton" style={{ display: "block", width: "100%", height: 8, marginTop: 14 }} />
          <span className="skeleton" style={{ display: "block", width: "64%", height: 10, marginTop: 14 }} />
        </div>
      ))}
    </div>
  );
}

export function SystemPanel() {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<number[]>([]);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async (manual = false) => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    if (manual) setBusy(true);
    try {
      const response = await fetch("/api/admin/system", {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        const message =
          response.status === 403
            ? "This account is not a super-admin."
            : response.status === 401
              ? "Your session expired. Sign in again."
              : `The console API answered ${response.status}.`;
        throw new Error(message);
      }
      const data = (await response.json()) as SystemSnapshot;
      setSnapshot(data);
      setError(null);
      setHistory((previous) => {
        const fallback = data.nodes.fallback;
        const next = [...previous, fallback.memory?.rssBytes ?? 0];
        return next.slice(-HISTORY_LENGTH);
      });
    } catch (caught) {
      if ((caught as Error).name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Could not reach the console API.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      inFlight.current?.abort();
    };
  }, [load]);

  const primary = snapshot?.nodes.primary ?? null;
  const updated = snapshot ? new Date(snapshot.generatedAt).toLocaleTimeString("en-GB") : null;

  const verdict =
    primary?.status === "online"
      ? `The Actix primary answered in ${primary.latencyMs ?? 0} ms. The site itself is still served by Next.js.`
      : primary?.status === "degraded"
        ? "The Actix primary is alive, but it is not reporting detailed metrics."
        : primary?.status === "not_configured"
          ? "No Actix primary is configured, so Next.js carries every request."
          : "The Actix primary is not answering. Next.js is unaffected.";

  return (
    <section className="card srv-card" aria-labelledby="servers-heading">
      <div className="spread srv-card-head">
        <div>
          <p className="eyebrow" style={{ marginBottom: 2 }}>
            {updated ? `Live · updated ${updated}` : "Live · connecting"}
          </p>
          <h2 id="servers-heading" style={{ fontSize: "1.25rem", margin: 0 }}>
            Servers
          </h2>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          aria-busy={busy}
          disabled={busy}
          onClick={() => void load(true)}
        >
          {busy ? <span className="btn-spinner" aria-hidden="true" /> : null}
          {busy ? "Checking…" : "Refresh"}
        </button>
      </div>

      {!snapshot && !error ? <PanelSkeleton /> : null}

      {!snapshot && error ? (
        <div className="srv-error" role="alert">
          <div>
            <strong>Server health is unavailable.</strong>
            <p className="small muted" style={{ margin: "2px 0 0" }}>{error}</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load(true)}>
            Try again
          </button>
        </div>
      ) : null}

      {snapshot ? (
        <>
          <p className={`srv-verdict srv-verdict-${primary?.status ?? "unknown"}`} aria-live="polite">
            <span className="srv-verdict-tag">Serving</span>
            <strong>{snapshot.serving === "fallback" ? "Fallback · Next.js" : "Primary · Actix"}</strong>
            <span className="small muted">{verdict}</span>
          </p>

          {error ? (
            <p className="srv-stale" role="status">
              The last check failed ({error}). Showing the previous reading from {updated}.
            </p>
          ) : null}

          <div className="srv-grid">
            <NodeCard node={snapshot.nodes.primary} />
            <NodeCard node={snapshot.nodes.fallback} history={history} />
          </div>

          <div className="srv-foot">
            <span className="tiny muted">
              {snapshot.traffic.requests} API request{snapshot.traffic.requests === 1 ? "" : "s"} in the
              last {snapshot.traffic.windowMinutes} min
              {snapshot.traffic.p95Ms !== null
                ? ` · p95 ${snapshot.traffic.p95Ms} ms${
                    snapshot.traffic.requests < MIN_LATENCY_SAMPLES
                      ? ` (${snapshot.traffic.requests} requests, too few to judge)`
                      : ""
                  }`
                : ""}
              {snapshot.traffic.errors > 0 ? ` · ${snapshot.traffic.errors} error${snapshot.traffic.errors === 1 ? "" : "s"}` : ""}
              {" · "}env {snapshot.environment}
            </span>
            <details className="srv-notes">
              <summary className="tiny">How this is measured</summary>
              <ul className="tiny muted">
                {snapshot.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </details>
          </div>
        </>
      ) : null}
    </section>
  );
}
