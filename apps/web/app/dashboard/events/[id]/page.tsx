import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EVENT_CATEGORIES } from "@campussphere/contracts";
import { categoryLabel } from "@/lib/format";
import {
  clubsWhereOfficer,
  getEventForManager,
  listEventFeedback,
  listRoster,
} from "@campussphere/core";
import { currentUser } from "@/lib/session";
import { formatDateRange, formatDateTime, titleCase } from "@/lib/format";
import { Notice, Tag } from "@/components/Pieces";
import {
  cancelEventAction,
  checkInAction,
  publishEventAction,
  updateEventAction,
} from "@/app/actions/events";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata: Metadata = { title: "Event tools", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function toLocalInput(value: string): string {
  const date = new Date(value);
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default async function EventManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const messages = await searchParams;
  const me = await currentUser();
  if (!me) redirect(`/login?next=/dashboard/events/${id}`);

  let event;
  try {
    event = await getEventForManager(id, me);
  } catch {
    notFound();
  }
  const [roster, feedback, clubs] = await Promise.all([
    listRoster(id, me),
    listEventFeedback(id, me).catch(() => []),
    clubsWhereOfficer(me.id),
  ]);
  const registered = roster.filter((row) => row.status === "registered").length;
  const waitlisted = roster.filter((row) => row.status === "waitlisted").length;
  const attended = roster.filter((row) => row.status === "attended").length;
  const cancellable = !["cancelled", "completed"].includes(event.status);

  return (
    <div className="shell">
      <div className="page-head">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/dashboard">Dashboard</Link> <span aria-hidden="true">/</span> <span>{event.title}</span>
        </nav>
        <div className="tag-row" style={{ marginBottom: 8 }}>
          <Tag tone={event.status === "published" ? "forest" : event.status === "cancelled" ? "danger" : "marigold"}>
            {titleCase(event.status)}
          </Tag>
          <Tag>{categoryLabel(event.category)}</Tag>
          {event.status === "published" ? <Link className="tag" href={`/events/${event.slug}`}>Public page</Link> : null}
        </div>
        <h1>{event.title}</h1>
        <p className="lede">{formatDateRange(event.startsAt, event.endsAt, event.timezone)}</p>
      </div>

      {messages.ok ? <Notice>{messages.ok}</Notice> : null}
      {messages.error ? <Notice tone="danger">{messages.error}</Notice> : null}

      <div className="stat-row">
        <div className="mini-stat"><b>{registered}</b><span>Registered</span></div>
        <div className="mini-stat"><b>{waitlisted}</b><span>Waitlisted</span></div>
        <div className="mini-stat"><b>{attended}</b><span>Checked in</span></div>
        <div className="mini-stat"><b>{event.capacity ?? "∞"}</b><span>Capacity</span></div>
      </div>

      <div className="dash-grid mt-3">
        <section className="card">
          <h2 style={{ fontSize: "1.2rem" }}>Check people in</h2>
          <p className="small muted">
            Attendees open their ticket page and show a QR code. Enter the code here (or send it to the
            organizer at the door). Each code works once and expires after two hours.
          </p>
          <form action={checkInAction} className="inline-form">
            <input type="hidden" name="eventId" value={event.id} />
            <label className="sr-only" htmlFor="code">Check-in code</label>
            <input className="input" id="code" name="code" required minLength={6} maxLength={40} placeholder="Paste check-in code" style={{ maxWidth: 320 }} />
            <SubmitButton className="btn btn-primary">Check in</SubmitButton>
          </form>
        </section>

        <section className="card">
          <h2 style={{ fontSize: "1.2rem" }}>Publishing</h2>
          {event.status === "draft" || event.status === "changes_requested" ? (
            <p className="small muted">Submit this draft for review before it can be published.</p>
          ) : null}
          {event.status === "submitted" ? (
            <p className="small muted">Waiting for a super-admin decision.</p>
          ) : null}
          {event.status === "approved" ? (
            <form action={publishEventAction}>
              <input type="hidden" name="eventId" value={event.id} />
              <SubmitButton className="btn btn-primary">Publish event</SubmitButton>
            </form>
          ) : null}
          {event.status === "published" ? (
            <p className="small muted">Published. Registration is live on the public page.</p>
          ) : null}
          {cancellable ? (
            <details className="mt-2">
              <summary className="small" style={{ cursor: "pointer", color: "var(--danger)" }}>Cancel this event</summary>
              <form action={cancelEventAction} className="mt-1">
                <input type="hidden" name="eventId" value={event.id} />
                <div className="field">
                  <label htmlFor="reason">Reason (sent to everyone registered)</label>
                  <input className="input" id="reason" name="reason" required minLength={3} maxLength={500} />
                </div>
                <SubmitButton className="btn btn-danger" confirm="Cancel the event and notify everyone?">
                  Cancel event
                </SubmitButton>
              </form>
            </details>
          ) : null}
        </section>

        <section className="card" style={{ gridColumn: "1 / -1" }}>
          <h2 style={{ fontSize: "1.2rem" }}>Roster</h2>
          {roster.length === 0 ? (
            <p className="small muted">No registrations yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Name</th><th>Status</th><th>Registered</th><th>Checked in</th></tr>
                </thead>
                <tbody>
                  {roster.map((row) => (
                    <tr key={row.registrationId}>
                      <td>{row.user.name}</td>
                      <td><Tag tone={row.status === "attended" ? "forest" : row.status === "waitlisted" ? "marigold" : undefined}>{row.status}</Tag></td>
                      <td>{formatDateTime(row.createdAt)}</td>
                      <td>{row.checkedInAt ? formatDateTime(row.checkedInAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <h2 style={{ fontSize: "1.2rem" }}>Feedback</h2>
          {feedback.length === 0 ? (
            <p className="small muted">Feedback opens after the event for attendees.</p>
          ) : (
            <div className="stack">
              {feedback.map((entry) => (
                <div key={entry.id}>
                  <div className="small"><strong>{entry.rating}/5</strong> — {entry.user.name}</div>
                  {entry.comment ? <p className="small muted" style={{ margin: "2px 0" }}>{entry.comment}</p> : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2 style={{ fontSize: "1.2rem" }}>Event facts</h2>
          <dl className="fact-list">
            <div className="fact"><dt>Venue</dt><dd>{event.venueName ?? "—"}{event.venueAddress ? ` · ${event.venueAddress}` : ""}</dd></div>
            <div className="fact"><dt>Online</dt><dd>{event.onlineUrl ? <a href={event.onlineUrl} rel="noreferrer nofollow noopener" target="_blank">Meeting link</a> : "No"}</dd></div>
            <div className="fact"><dt>Waitlist</dt><dd>{waitlisted > 0 ? `${waitlisted} waiting` : "Empty"}</dd></div>
          </dl>
        </section>
      </div>

      {["draft", "submitted", "changes_requested", "approved", "published"].includes(event.status) ? (
        <section className="section">
          <div className="section-head">
            <h2 style={{ fontSize: "1.5rem" }}>Edit event</h2>
            <span className="small muted">Capacity cannot drop below confirmed registrations.</span>
          </div>
          <form action={updateEventAction} className="card">
            <input type="hidden" name="eventId" value={event.id} />
            <div className="field">
              <label htmlFor="title">Title</label>
              <input className="input" id="title" name="title" defaultValue={event.title} maxLength={160} />
            </div>
            <div className="field">
              <label htmlFor="summary">Summary</label>
              <input className="input" id="summary" name="summary" defaultValue={event.summary} maxLength={300} />
            </div>
            <div className="field">
              <label htmlFor="description">Description</label>
              <textarea className="textarea" id="description" name="description" defaultValue={event.description} rows={6} maxLength={10000} />
            </div>
            <div className="form-grid two">
              <div className="field">
                <label htmlFor="category">Category</label>
                <select className="select" id="category" name="category" defaultValue={event.category}>
                  {EVENT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>{categoryLabel(category)}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="clubId">Club</label>
                <select className="select" id="clubId" name="clubId" defaultValue={event.club?.id ?? ""}>
                  <option value="">Campus-wide / personal</option>
                  {clubs.map((club) => (
                    <option key={club.id} value={club.id}>{club.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-grid two">
              <div className="field">
                <label htmlFor="startsAt">Starts</label>
                <input className="input" id="startsAt" name="startsAt" type="datetime-local" defaultValue={toLocalInput(event.startsAt)} />
              </div>
              <div className="field">
                <label htmlFor="endsAt">Ends</label>
                <input className="input" id="endsAt" name="endsAt" type="datetime-local" defaultValue={toLocalInput(event.endsAt)} />
              </div>
            </div>
            <div className="form-grid two">
              <div className="field">
                <label htmlFor="venueName">Venue</label>
                <input className="input" id="venueName" name="venueName" defaultValue={event.venueName ?? ""} maxLength={200} />
              </div>
              <div className="field">
                <label htmlFor="capacity">Capacity</label>
                <input className="input" id="capacity" name="capacity" type="number" min={1} max={10000} defaultValue={event.capacity ?? ""} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="onlineUrl">Online link</label>
              <input className="input" id="onlineUrl" name="onlineUrl" type="url" defaultValue={event.onlineUrl ?? ""} maxLength={600} />
            </div>
            <div className="field">
              <label htmlFor="accessibilityNotes">Accessibility notes</label>
              <textarea className="textarea" id="accessibilityNotes" name="accessibilityNotes" defaultValue={event.accessibilityNotes ?? ""} rows={2} maxLength={1500} />
            </div>
            <div className="field">
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" name="waitlistEnabled" defaultChecked={event.waitlistCount >= 0} />
                Waitlist enabled
              </label>
            </div>
            <SubmitButton className="btn btn-primary">Save changes</SubmitButton>
          </form>
        </section>
      ) : null}
    </div>
  );
}
