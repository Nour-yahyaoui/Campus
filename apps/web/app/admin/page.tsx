import Link from "next/link";
import type { Metadata } from "next";
import { adminOverview, reviewQueues } from "@campussphere/core";
import { requireSuperAdmin } from "@/lib/session";
import { formatDateTime, formatRelative, titleCase } from "@/lib/format";
import { EmptyState, Notice, Tag } from "@/components/Pieces";
import { decideProjectAction } from "@/app/actions/projects";
import { decideEventAction } from "@/app/actions/events";
import { SubmitButton } from "@/components/SubmitButton";
import { SystemPanel } from "@/components/SystemPanel";

export const metadata: Metadata = { title: "Admin overview", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; ok?: string; error?: string }>;
}) {
  const messages = await searchParams;
  const me = await requireSuperAdmin("/admin");
  const [overview, queues] = await Promise.all([adminOverview(me), reviewQueues(me)]);
  const tab = messages.tab === "events" ? "events" : messages.tab === "clubs" ? "clubs" : "projects";

  return (
    <>
      {messages.ok ? <Notice>{messages.ok}</Notice> : null}
      {messages.error ? <Notice tone="danger">{messages.error}</Notice> : null}

      <div className="stat-row" style={{ marginBottom: 24 }}>
        <div className="mini-stat"><b>{overview.users}</b><span>Accounts</span></div>
        <div className="mini-stat"><b>{overview.clubs}</b><span>Active clubs</span></div>
        <div className="mini-stat"><b>{overview.pendingProjects + overview.pendingEvents + overview.pendingClubApplications}</b><span>Items awaiting review</span></div>
        <div className="mini-stat"><b>{overview.openReports}</b><span>Open reports</span></div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <SystemPanel />
      </div>

      <div className="card">
        <div className="spread">
          <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Review queue</h2>
          <div className="filter-bar" style={{ margin: 0 }}>
            {[
              { key: "projects", label: `Projects (${queues.projects.length})` },
              { key: "events", label: `Events (${queues.events.length})` },
              { key: "clubs", label: `Club requests (${queues.clubApplications.length})` },
            ].map((item) => (
              <Link
                key={item.key}
                className="chip"
                href={`/admin?tab=${item.key}`}
                aria-current={tab === item.key ? "true" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {tab === "projects" ? (
          queues.projects.length === 0 ? (
            <EmptyState title="No project proposals waiting">Approved projects appear publicly immediately.</EmptyState>
          ) : (
            <div className="stack-lg mt-2">
              {queues.projects.map((project) => (
                <article key={project.id} className="card card-flat" style={{ background: "var(--paper)" }}>
                  <div className="spread">
                    <h3 style={{ fontSize: "1.1rem", margin: 0 }}>{project.title}</h3>
                    <span className="tiny muted">submitted {formatRelative(project.submittedAt)}</span>
                  </div>
                  <p className="small muted" style={{ margin: "6px 0" }}>{project.summary}</p>
                  <div className="tag-row">
                    <Tag>{titleCase(project.category)}</Tag>
                    <Tag>Lead: {project.lead.name}</Tag>
                    {project.proposalClub ? <Tag tone="forest">{project.proposalClub}</Tag> : null}
                    <Tag>{project.memberCount} member{project.memberCount === 1 ? "" : "s"}</Tag>
                  </div>
                  <details className="mt-2">
                    <summary className="small" style={{ cursor: "pointer" }}>Read full proposal</summary>
                    <div className="prose small mt-1">{project.summary}</div>
                  </details>
                  <div className="dash-grid mt-2">
                    <form action={decideProjectAction} className="stack">
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label htmlFor={`approve-${project.id}`}>Approval note (optional)</label>
                        <input className="input" id={`approve-${project.id}`} name="notes" maxLength={2000} />
                      </div>
                      <SubmitButton className="btn btn-primary btn-sm">Approve</SubmitButton>
                    </form>
                    <form action={decideProjectAction} className="stack">
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="decision" value="request_changes" />
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label htmlFor={`changes-${project.id}`}>What should change?</label>
                        <input className="input" id={`changes-${project.id}`} name="notes" required minLength={3} maxLength={2000} />
                      </div>
                      <SubmitButton className="btn btn-secondary btn-sm">Request changes</SubmitButton>
                    </form>
                    <form action={decideProjectAction} className="stack">
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label htmlFor={`reject-${project.id}`}>Reason for rejection</label>
                        <input className="input" id={`reject-${project.id}`} name="notes" required minLength={3} maxLength={2000} />
                      </div>
                      <SubmitButton className="btn btn-danger btn-sm" confirm="Reject this proposal?">Reject</SubmitButton>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : null}

        {tab === "events" ? (
          queues.events.length === 0 ? (
            <EmptyState title="No event proposals waiting">Approved events still need the organizer to publish them.</EmptyState>
          ) : (
            <div className="stack-lg mt-2">
              {queues.events.map((event) => (
                <article key={event.id} className="card card-flat" style={{ background: "var(--paper)" }}>
                  <div className="spread">
                    <h3 style={{ fontSize: "1.1rem", margin: 0 }}>{event.title}</h3>
                    <span className="tiny muted">submitted {formatRelative(event.submittedAt)}</span>
                  </div>
                  <p className="small muted" style={{ margin: "6px 0" }}>{event.summary}</p>
                  <div className="tag-row">
                    <Tag>{titleCase(event.category)}</Tag>
                    <Tag>Organizer: {event.organizer.name}</Tag>
                    {event.club ? <Tag tone="forest">{event.club.name}</Tag> : null}
                    <Tag>{formatDateTime(event.startsAt)}</Tag>
                    <Tag>{event.capacity ? `${event.capacity} places` : "Unlimited"}</Tag>
                  </div>
                  <div className="dash-grid mt-2">
                    <form action={decideEventAction} className="stack">
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label htmlFor={`ev-approve-${event.id}`}>Approval note (optional)</label>
                        <input className="input" id={`ev-approve-${event.id}`} name="notes" maxLength={2000} />
                      </div>
                      <SubmitButton className="btn btn-primary btn-sm">Approve</SubmitButton>
                    </form>
                    <form action={decideEventAction} className="stack">
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="decision" value="request_changes" />
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label htmlFor={`ev-changes-${event.id}`}>What should change?</label>
                        <input className="input" id={`ev-changes-${event.id}`} name="notes" required minLength={3} maxLength={2000} />
                      </div>
                      <SubmitButton className="btn btn-secondary btn-sm">Request changes</SubmitButton>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : null}

        {tab === "clubs" ? (
          queues.clubApplications.length === 0 ? (
            <EmptyState title="No club membership requests">Club officers handle their own requests; this queue is the cross-club view.</EmptyState>
          ) : (
            <div className="table-wrap mt-2">
              <table className="data">
                <tbody>
                  {queues.clubApplications.map((application) => (
                    <tr key={application.id}>
                      <td>{application.user.name}<div className="tiny muted">{application.user.email}</div></td>
                      <td>{application.club.name}</td>
                      <td className="small">{application.message ?? "—"}</td>
                      <td>{formatDateTime(application.createdAt)}</td>
                      <td><Link className="small" href={`/clubs/${application.club.slug}/manage`}>Open club</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>

      <div className="card mt-3">
        <div className="spread">
          <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Recent audit activity</h2>
          <Link className="small" href="/admin/audit">Full log</Link>
        </div>
        <div className="stack mt-2">
          {overview.recentAudit.map((event) => (
            <div key={event.id} className="spread" style={{ gap: 8 }}>
              <div>
                <span className="mono">{event.action}</span>{" "}
                <span className="small muted">{event.actor?.name ?? "system"} → {event.entityType}</span>
              </div>
              <span className="tiny muted">{formatRelative(event.createdAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
