import type { Metadata } from "next";
import Link from "next/link";
import { listReports } from "@campussphere/core";
import { requireSuperAdmin } from "@/lib/session";
import { formatDateTime, titleCase } from "@/lib/format";
import { EmptyState, Notice, Tag } from "@/components/Pieces";
import { resolveReportAction } from "@/app/actions/moderation";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata: Metadata = { title: "Moderation", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; ok?: string; error?: string }>;
}) {
  const params = await searchParams;
  const me = await requireSuperAdmin("/admin/reports");
  const status = ["open", "under_review", "resolved", "dismissed"].includes(params.status ?? "")
    ? (params.status as "open" | "under_review" | "resolved" | "dismissed")
    : undefined;
  const reports = await listReports(me, status);

  return (
    <>
      {params.ok ? <Notice>{params.ok}</Notice> : null}
      {params.error ? <Notice tone="danger">{params.error}</Notice> : null}

      <div className="filter-bar">
        {[
          { value: "", label: "All" },
          { value: "open", label: "Open" },
          { value: "under_review", label: "Under review" },
          { value: "resolved", label: "Resolved" },
          { value: "dismissed", label: "Dismissed" },
        ].map((option) => (
          <Link
            key={option.value || "all"}
            className="chip"
            href={option.value ? `/admin/reports?status=${option.value}` : "/admin/reports"}
            aria-current={(status ?? "") === option.value ? "true" : undefined}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {reports.length === 0 ? (
        <EmptyState title="No reports here">The moderation queue is clear for this filter.</EmptyState>
      ) : (
        <div className="stack-lg">
          {reports.map((report) => (
            <article key={report.id} className="card">
              <div className="spread">
                <h2 style={{ fontSize: "1.1rem", margin: 0 }}>
                  {report.targetType}: {report.targetLabel ?? report.targetId.slice(0, 8)}
                </h2>
                <Tag tone={report.status === "open" ? "danger" : report.status === "resolved" ? "forest" : "marigold"}>
                  {titleCase(report.status)}
                </Tag>
              </div>
              <p className="small" style={{ margin: "8px 0 4px" }}><strong>Reason:</strong> {report.reason}</p>
              {report.details ? <p className="small muted">{report.details}</p> : null}
              <p className="tiny muted">
                Filed by {report.reporter.name} · {formatDateTime(report.createdAt)}
                {report.resolvedAt ? ` · resolved ${formatDateTime(report.resolvedAt)}` : ""}
              </p>
              {report.resolutionNotes ? <p className="small">Resolution: {report.resolutionNotes}</p> : null}
              {report.status === "open" || report.status === "under_review" ? (
                <form action={resolveReportAction} className="mt-2">
                  <input type="hidden" name="reportId" value={report.id} />
                  <div className="form-grid two">
                    <div className="field">
                      <label htmlFor={`status-${report.id}`}>Set status</label>
                      <select className="select" id={`status-${report.id}`} name="status" defaultValue="resolved">
                        <option value="under_review">Under review</option>
                        <option value="resolved">Resolved</option>
                        <option value="dismissed">Dismissed</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`notes-${report.id}`}>Notes</label>
                      <input className="input" id={`notes-${report.id}`} name="notes" maxLength={2000} />
                    </div>
                  </div>
                  <SubmitButton className="btn btn-secondary btn-sm">Save decision</SubmitButton>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
