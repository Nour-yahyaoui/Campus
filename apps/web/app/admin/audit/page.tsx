import type { Metadata } from "next";
import Link from "next/link";
import { listAudit } from "@campussphere/core";
import { requireSuperAdmin } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { EmptyState, Tag } from "@/components/Pieces";

export const metadata: Metadata = { title: "Audit log", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; action?: string }>;
}) {
  const params = await searchParams;
  await requireSuperAdmin("/admin/audit");
  const before = params.before ? Number(params.before) : undefined;
  const events = await listAudit({
    limit: 100,
    beforeId: Number.isFinite(before) ? before : undefined,
    actionPrefix: params.action,
  });
  const last = events.at(-1);

  return (
    <>
      <div className="spread" style={{ margin: "10px 0 18px" }}>
        <h2 style={{ margin: 0, fontSize: "1.4rem" }}>Append-only audit log</h2>
        <span className="small muted">Updates and deletes are rejected by a database trigger.</span>
      </div>
      <div className="filter-bar">
        {[
          { value: "", label: "All" },
          { value: "auth.", label: "Auth" },
          { value: "club.", label: "Clubs" },
          { value: "project.", label: "Projects" },
          { value: "event.", label: "Events" },
          { value: "admin.", label: "Admin" },
          { value: "moderation.", label: "Moderation" },
          { value: "user.", label: "Users" },
        ].map((option) => (
          <Link
            key={option.value || "all"}
            className="chip"
            href={option.value ? `/admin/audit?action=${encodeURIComponent(option.value)}` : "/admin/audit"}
            aria-current={(params.action ?? "") === option.value ? "true" : undefined}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {events.length === 0 ? (
        <EmptyState title="Nothing recorded for this filter" />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Entity</th><th>Metadata</th></tr></thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="tiny">{formatDateTime(event.createdAt)}</td>
                  <td><span className="mono">{event.action}</span></td>
                  <td className="small">{event.actor?.name ?? "system"}</td>
                  <td className="small">{event.entityType}<div className="tiny muted mono">{event.entityId.slice(0, 8)}…</div></td>
                  <td><code className="tiny" style={{ wordBreak: "break-all" }}>{JSON.stringify(event.metadata)}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {last ? (
        <div className="row mt-2">
          <Link className="btn btn-secondary btn-sm" href={`/admin/audit?before=${last.id}${params.action ? `&action=${encodeURIComponent(params.action)}` : ""}`}>
            Older entries
          </Link>
        </div>
      ) : null}
    </>
  );
}
