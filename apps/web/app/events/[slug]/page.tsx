import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEventBySlug } from "@campussphere/core";
import { currentUser } from "@/lib/session";
import { categoryLabel, formatDateRange, formatRelative } from "@/lib/format";
import { Avatar, Notice, Tag } from "@/components/Pieces";
import { cancelRegistrationAction, feedbackAction, registerAction } from "@/app/actions/events";
import { reportAction } from "@/app/actions/moderation";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const event = await getEventBySlug(slug, null);
    return {
      title: event.title,
      description: event.summary,
      alternates: { canonical: `/events/${event.slug}` },
      openGraph: {
        type: "article",
        title: event.title,
        description: event.summary,
        url: `/events/${event.slug}`,
      },
    };
  } catch {
    return { title: "Event not found" };
  }
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const messages = await searchParams;
  const me = await currentUser();
  let event;
  try {
    event = await getEventBySlug(slug, me);
  } catch {
    notFound();
  }

  const now = Date.now();
  const ended = new Date(event.endsAt).getTime() < now;
  const started = new Date(event.startsAt).getTime() < now;
  const open = event.status === "published" && !ended;
  const registration = event.registration;
  const spotsLeft = event.capacity === null ? null : Math.max(0, event.capacity - event.registeredCount);
  const full = spotsLeft !== null && spotsLeft === 0;
  const isOrganizer = Boolean(me && event.organizers.some((organizer) => organizer.id === me.id));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.summary,
    startDate: event.startsAt,
    endDate: event.endsAt,
    eventStatus: event.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: event.isOnline
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    location: event.isOnline
      ? { "@type": "VirtualLocation", url: event.onlineUrl ?? undefined }
      : { "@type": "Place", name: event.venueName ?? "Campus venue", address: event.venueAddress ?? undefined },
    organizer: event.club
      ? { "@type": "Organization", name: event.club.name, url: `/clubs/${event.club.slug}` }
      : undefined,
  };

  return (
    <div className="shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="page-head">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/events">Events</Link> <span aria-hidden="true">/</span> <span>{event.title}</span>
        </nav>
        <div className="tag-row" style={{ marginBottom: 10 }}>
          {event.club ? <Tag tone="forest">{event.club.name}</Tag> : <Tag>Campus-wide</Tag>}
          <Tag>{categoryLabel(event.category)}</Tag>
          {event.status === "cancelled" ? <Tag tone="danger">Cancelled</Tag> : null}
          {ended ? <Tag>Finished</Tag> : null}
        </div>
        {event.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="cover-banner" src={event.coverUrl} alt="" width={1200} height={375} decoding="async" />
        ) : null}
        <h1>{event.title}</h1>
        <p className="lede">{event.summary}</p>
      </div>

      {messages.ok ? <Notice>{messages.ok}</Notice> : null}
      {messages.error ? <Notice tone="danger">{messages.error}</Notice> : null}

      <div className="split">
        <div>
          {event.status === "cancelled" ? (
            <div className="callout callout-danger" style={{ marginBottom: 18 }}>
              <strong>This event was cancelled.</strong> Registered attendees were notified and emailed.
            </div>
          ) : null}
          <div className="card">
            <h2 style={{ fontSize: "1.3rem" }}>About this event</h2>
            <div className="prose">{event.description}</div>
            {event.accessibilityNotes ? (
              <>
                <hr />
                <h2 style={{ fontSize: "1.15rem" }}>Accessibility</h2>
                <p className="small">{event.accessibilityNotes}</p>
              </>
            ) : null}
          </div>

          {ended && registration?.status === "attended" ? (
            <div className="card mt-2">
              <h2 style={{ fontSize: "1.2rem" }}>How was it?</h2>
              {event.feedback ? (
                <p className="small">
                  You rated this event {event.feedback.rating}/5.
                  {event.feedback.comment ? ` “${event.feedback.comment}”` : ""}
                </p>
              ) : (
                <form action={feedbackAction}>
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="slug" value={event.slug} />
                  <div className="field">
                    <label htmlFor="rating">Rating (1–5)</label>
                    <select className="select" id="rating" name="rating" defaultValue="5">
                      {[5, 4, 3, 2, 1].map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="comment">Comment <span className="hint">(optional, visible to organizers)</span></label>
                    <textarea className="textarea" id="comment" name="comment" rows={3} maxLength={1000} />
                  </div>
                  <SubmitButton className="btn btn-secondary">Send feedback</SubmitButton>
                </form>
              )}
            </div>
          ) : null}
        </div>

        <aside className="sidebar">
          <div className="card">
            <h2 style={{ fontSize: "1.15rem" }}>When &amp; where</h2>
            <dl className="fact-list">
              <div className="fact">
                <dt>Date</dt>
                <dd>{formatDateRange(event.startsAt, event.endsAt, event.timezone)}</dd>
              </div>
              <div className="fact">
                <dt>Location</dt>
                <dd>
                  {event.isOnline ? (
                    event.onlineUrl ? (
                      <a href={event.onlineUrl} rel="noreferrer nofollow noopener" target="_blank">
                        Online meeting link
                      </a>
                    ) : (
                      "Online"
                    )
                  ) : (
                    <>
                      {event.venueName}
                      {event.venueAddress ? <span className="muted small"> — {event.venueAddress}</span> : null}
                    </>
                  )}
                </dd>
              </div>
              <div className="fact">
                <dt>Places</dt>
                <dd>
                  {event.capacity === null
                    ? `${event.registeredCount} registered · unlimited capacity`
                    : `${event.registeredCount} of ${event.capacity} filled${spotsLeft !== null ? ` · ${spotsLeft} left` : ""}`}
                  {event.waitlistCount > 0 ? ` · ${event.waitlistCount} waitlisted` : ""}
                </dd>
              </div>
              {event.contactEmail ? (
                <div className="fact">
                  <dt>Contact</dt>
                  <dd><a href={`mailto:${event.contactEmail}`}>{event.contactEmail}</a></dd>
                </div>
              ) : null}
              <div className="fact">
                <dt>Starts</dt>
                <dd>{formatRelative(event.startsAt)}</dd>
              </div>
            </dl>

            <div className="mt-2">
              {event.status === "cancelled" ? (
                <p className="small muted">Registration is closed.</p>
              ) : registration ? (
                <>
                  <p className="small">
                    <Tag tone={registration.status === "waitlisted" ? "marigold" : "forest"}>
                      {registration.status === "registered"
                        ? "You're registered"
                        : registration.status === "waitlisted"
                          ? `Waitlisted · position ${registration.position}`
                          : registration.status === "attended"
                            ? "Checked in"
                            : registration.status}
                    </Tag>
                  </p>
                  {registration.status !== "attended" ? (
                    <form action={cancelRegistrationAction}>
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="slug" value={event.slug} />
                      <SubmitButton className="btn btn-secondary btn-block" confirm="Cancel your place?">
                        Cancel registration
                      </SubmitButton>
                    </form>
                  ) : null}
                  {registration.status === "registered" ? (
                    <Link className="btn btn-primary btn-block mt-1" href={`/dashboard/events/${event.id}/ticket`}>
                      Open check-in ticket
                    </Link>
                  ) : null}
                </>
              ) : !me ? (
                <Link className="btn btn-primary btn-block" href={`/login?next=/events/${event.slug}`}>
                  Sign in to {full ? "join the waitlist" : "register"}
                </Link>
              ) : open ? (
                <form action={registerAction}>
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="slug" value={event.slug} />
                  <SubmitButton className="btn btn-primary btn-block">
                    {full ? (event.waitlistCount >= 0 ? "Join the waitlist" : "Registration closed") : "Register"}
                  </SubmitButton>
                  <p className="tiny muted" style={{ marginTop: 8 }}>
                    {full
                      ? "The event is full. If a place opens, the first person on the waitlist is promoted automatically."
                      : "Registration is confirmed immediately. A confirmation email is queued."}
                  </p>
                </form>
              ) : (
                <p className="small muted">
                  {ended ? "This event has ended." : started ? "Registration has closed." : "Registration is not open."}
                </p>
              )}
            </div>

            {isOrganizer ? (
              <Link className="btn btn-secondary btn-block mt-2" href={`/dashboard/events/${event.id}`}>
                Organizer tools
              </Link>
            ) : null}
          </div>

          <div className="card">
            <h2 style={{ fontSize: "1.15rem" }}>Organizers</h2>
            {event.organizers.map((organizer) => (
              <div className="member-row" key={organizer.id}>
                <Avatar name={organizer.name} src={organizer.avatarUrl} />
                <div>
                  <div className="small">{organizer.name}</div>
                  <div className="tiny muted">{organizer.bio?.slice(0, 80) ?? "Organizer"}</div>
                </div>
              </div>
            ))}
          </div>

          {me ? (
            <details>
              <summary className="small muted" style={{ cursor: "pointer" }}>Report a problem</summary>
              <form action={reportAction} className="card mt-1">
                <input type="hidden" name="targetType" value="event" />
                <input type="hidden" name="targetId" value={event.id} />
                <input type="hidden" name="returnTo" value={`/events/${event.slug}`} />
                <div className="field">
                  <label htmlFor="reason">Reason</label>
                  <input className="input" id="reason" name="reason" maxLength={120} required />
                </div>
                <SubmitButton className="btn btn-secondary btn-sm">Send report</SubmitButton>
              </form>
            </details>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
