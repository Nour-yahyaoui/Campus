import Link from "next/link";
import type { Metadata } from "next";
import {
  accountSummary,
  listNotifications,
  myEvents,
  myProjects,
} from "@campussphere/core";
import { currentUser } from "@/lib/session";
import { Notice, Tag } from "@/components/Pieces";
import { formatDateTime, formatRelative, titleCase } from "@/lib/format";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Your dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; denied?: string }>;
}) {
  const messages = await searchParams;
  const me = await currentUser();
  if (!me) redirect("/login?next=/dashboard");

  const [summary, projects, events, notifications] = await Promise.all([
    accountSummary(me.id),
    myProjects(me),
    myEvents(me),
    listNotifications(me.id, 5),
  ]);
  const upcoming = events.attending
    .filter((event) => new Date(event.startsAt).getTime() > Date.now())
    .slice(0, 4);
  const organizing = events.organizing.slice(0, 4);

  return (
    <div className="shell">
      <div className="page-head">
        <p className="eyebrow">Your space</p>
        <h1>Hi, {me.name.split(" ")[0]}.</h1>
        <p className="lede">Everything you joined, applied to or organised, in one place.</p>
      </div>

      {messages.ok ? <Notice>{messages.ok}</Notice> : null}
      {messages.error ? <Notice tone="danger">{messages.error}</Notice> : null}
      {messages.denied ? <Notice tone="danger">That page needs super-admin access.</Notice> : null}

      <div className="stat-row">
        <div className="mini-stat"><b>{summary.clubs}</b><span>Club memberships</span></div>
        <div className="mini-stat"><b>{summary.projects}</b><span>Project teams</span></div>
        <div className="mini-stat"><b>{summary.events}</b><span>Event places</span></div>
        <div className="mini-stat"><b>{summary.pendingApplications}</b><span>Pending applications</span></div>
      </div>

      <div className="dash-grid mt-3">
        <section className="card dash-card">
          <div className="spread">
            <h2 style={{ fontSize: "1.2rem", margin: 0 }}>Your projects</h2>
            <Link className="small" href="/dashboard/projects/new">New proposal</Link>
          </div>
          {projects.led.length === 0 && projects.joined.length === 0 ? (
            <p className="small muted">
              No project teams yet. <Link href="/projects">Find one to join</Link> or propose your own.
            </p>
          ) : (
            <div className="stack">
              {[...projects.led, ...projects.joined].map((project) => (
                <div key={project.id} className="spread" style={{ gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <Link className="small" href={`/dashboard/projects/${project.id}`}>{project.title}</Link>
                    <div className="tiny muted">
                      {project.role === "lead" ? "Lead" : "Member"} · updated {formatRelative(project.updatedAt)}
                    </div>
                  </div>
                  <Tag tone={project.status === "approved" ? "forest" : project.status === "rejected" ? "danger" : "marigold"}>
                    {titleCase(project.status)}
                  </Tag>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card dash-card">
          <div className="spread">
            <h2 style={{ fontSize: "1.2rem", margin: 0 }}>Your events</h2>
            <Link className="small" href="/dashboard/events/new">New proposal</Link>
          </div>
          {upcoming.length === 0 && organizing.length === 0 ? (
            <p className="small muted">
              Nothing upcoming. <Link href="/events">Browse events</Link>.
            </p>
          ) : (
            <div className="stack">
              {organizing.map((event) => (
                <div key={`o-${event.id}`} className="spread" style={{ gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <Link className="small" href={`/dashboard/events/${event.id}`}>{event.title}</Link>
                    <div className="tiny muted">Organizing · {formatDateTime(event.startsAt)}</div>
                  </div>
                  <Tag tone={event.status === "published" ? "forest" : "marigold"}>{titleCase(event.status)}</Tag>
                </div>
              ))}
              {upcoming.map((event) => (
                <div key={`a-${event.id}`} className="spread" style={{ gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <Link className="small" href={`/events/${event.slug}`}>{event.title}</Link>
                    <div className="tiny muted">
                      {event.registrationStatus === "waitlisted"
                        ? "Waitlisted"
                        : event.registrationStatus === "attended"
                          ? "Checked in"
                          : "Registered"}{" "}
                      · {formatDateTime(event.startsAt)}
                    </div>
                  </div>
                  {event.registrationStatus === "registered" ? (
                    <Link className="btn btn-secondary btn-sm" href={`/dashboard/events/${event.id}/ticket`}>Ticket</Link>
                  ) : (
                    <Tag>{titleCase(String(event.registrationStatus))}</Tag>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card dash-card">
          <div className="spread">
            <h2 style={{ fontSize: "1.2rem", margin: 0 }}>Recent notifications</h2>
            <Link className="small" href="/dashboard/notifications">All</Link>
          </div>
          {notifications.length === 0 ? (
            <p className="small muted">No notifications yet. They appear when a decision is made or something you follow changes.</p>
          ) : (
            <div className="stack">
              {notifications.map((notification) => (
                <div key={notification.id}>
                  <div className="small">
                    {notification.readAt ? null : <span aria-label="Unread" style={{ color: "var(--marigold)" }}>● </span>}
                    {notification.title}
                  </div>
                  <div className="tiny muted">{formatRelative(notification.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card dash-card">
          <h2 style={{ fontSize: "1.2rem", margin: 0 }}>Quick links</h2>
          <div className="stack">
            <Link className="btn btn-secondary btn-block" href="/dashboard/profile">Profile, export &amp; deletion</Link>
            <Link className="btn btn-secondary btn-block" href="/dashboard/projects/new">Propose a project</Link>
            <Link className="btn btn-secondary btn-block" href="/dashboard/events/new">Propose an event</Link>
            {me.roles.includes("super_admin") ? (
              <>
                <Link className="btn btn-primary btn-block" href="/admin">Admin console</Link>
                <Link className="btn btn-secondary btn-block" href="/observatory">System Observatory</Link>
              </>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
