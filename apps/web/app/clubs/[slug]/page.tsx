import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { clubRoleFor, getClubBySlug } from "@campussphere/core";
import { currentUser } from "@/lib/session";
import { categoryLabel, formatDateRange, formatRelative } from "@/lib/format";
import { Avatar, ClubCard, EventRow, Monogram, Notice, ProjectCard, Tag } from "@/components/Pieces";
import { joinClubAction, leaveClubAction } from "@/app/actions/clubs";
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
    const club = await getClubBySlug(slug, null);
    return {
      title: club.name,
      description: club.tagline ?? `${club.name} on CampusSphere — ${club.description.slice(0, 150)}`,
      alternates: { canonical: `/clubs/${club.slug}` },
      openGraph: { title: club.name, description: club.tagline ?? undefined, url: `/clubs/${club.slug}` },
    };
  } catch {
    return { title: "Club not found" };
  }
}

export default async function ClubDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; error?: string; report?: string }>;
}) {
  const { slug } = await params;
  const messages = await searchParams;
  const me = await currentUser();
  let club;
  try {
    club = await getClubBySlug(slug, me);
  } catch {
    notFound();
  }
  const role = me ? await clubRoleFor(club.id, me.id) : null;
  const isOfficer = role === "officer" || role === "president";
  const membership = club.membership;

  return (
    <div className="shell">
      <div className="page-head">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/clubs">Clubs</Link> <span aria-hidden="true">/</span> <span>{club.name}</span>
        </nav>
        <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
          <Monogram name={club.name} />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ marginBottom: 6 }}>{club.name}</h1>
            <p className="lede" style={{ marginBottom: 8 }}>
              {club.tagline ?? "A student community on CampusSphere."}
            </p>
            <div className="tag-row">
              <Tag>{categoryLabel(club.category)}</Tag>
              {club.verified ? <Tag tone="forest">Verified by the platform</Tag> : null}
              <Tag>{club.memberCount} members</Tag>
              <Tag>
                {club.membershipPolicy === "open"
                  ? "Open to join"
                  : club.membershipPolicy === "request"
                    ? "Requests reviewed"
                    : "Invite only"}
              </Tag>
            </div>
          </div>
        </div>
      </div>

      {messages.ok ? <Notice>{messages.ok}</Notice> : null}
      {messages.error ? <Notice tone="danger">{messages.error}</Notice> : null}

      <div className="split mt-2">
        <div>
          <div className="card">
            <h2 style={{ fontSize: "1.3rem" }}>About</h2>
            <div className="prose">{club.description}</div>
            {club.announcements.length > 0 ? (
              <>
                <hr />
                <h2 id="announcements" style={{ fontSize: "1.3rem" }}>Announcements</h2>
                <div className="stack">
                  {club.announcements.map((announcement) => (
                    <article key={announcement.id} className="card card-flat" style={{ background: "var(--paper)" }}>
                      <div className="spread">
                        <h3 style={{ fontSize: "1.02rem", margin: 0 }}>{announcement.title}</h3>
                        {announcement.pinned ? <Tag tone="marigold">Pinned</Tag> : null}
                      </div>
                      <p className="small muted" style={{ margin: "4px 0 8px" }}>
                        {announcement.author.name} · {formatRelative(announcement.publishedAt)}
                      </p>
                      <p className="small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{announcement.body}</p>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <section className="section" style={{ paddingTop: 28 }}>
            <div className="section-head">
              <h2 style={{ fontSize: "1.5rem" }}>Upcoming events</h2>
            </div>
            {club.upcomingEvents.length === 0 ? (
              <p className="muted small">No upcoming events. Follow the club&apos;s announcements for updates.</p>
            ) : (
              <div className="card card-flat">
                {club.upcomingEvents.map((event) => (
                  <EventRow key={event.id} event={event} showClub={false} />
                ))}
              </div>
            )}
          </section>

          {club.pastEvents.length > 0 ? (
            <section>
              <div className="section-head">
                <h2 style={{ fontSize: "1.5rem" }}>Past events</h2>
              </div>
              <div className="card card-flat">
                {club.pastEvents.map((event) => (
                  <EventRow key={event.id} event={event} showClub={false} />
                ))}
              </div>
            </section>
          ) : null}

          <section className="section">
            <div className="section-head">
              <h2 style={{ fontSize: "1.5rem" }}>Projects</h2>
            </div>
            {club.projects.length === 0 ? (
              <p className="muted small">This club has no approved public projects yet.</p>
            ) : (
              <div className="grid-2">
                {club.projects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="sidebar">
          <div className="card">
            <h2 style={{ fontSize: "1.15rem" }}>Membership</h2>
            {membership ? (
              <p className="small">
                Your status: <strong>{membership.status}</strong>
                {membership.role ? ` · role: ${membership.role}` : ""}
              </p>
            ) : (
              <p className="small muted">
                {club.membershipPolicy === "invite"
                  ? "This club is invite-only. Ask an officer for an invitation."
                  : club.membershipPolicy === "open"
                    ? "This club is open — joining is immediate."
                    : "Send a short request; an officer will review it."}
              </p>
            )}

            {!me ? (
              <Link className="btn btn-primary btn-block" href={`/login?next=/clubs/${club.slug}`}>
                Sign in to {club.membershipPolicy === "open" ? "join" : "request to join"}
              </Link>
            ) : membership?.status === "active" ? (
              <form action={leaveClubAction}>
                <input type="hidden" name="clubId" value={club.id} />
                <input type="hidden" name="slug" value={club.slug} />
                <SubmitButton className="btn btn-secondary btn-block" confirm="Leave this club?">
                  Leave club
                </SubmitButton>
              </form>
            ) : membership?.status === "pending" ? (
              <p className="small"><Tag tone="marigold">Request pending</Tag></p>
            ) : club.membershipPolicy === "invite" ? null : (
              <form action={joinClubAction}>
                <input type="hidden" name="clubId" value={club.id} />
                <input type="hidden" name="slug" value={club.slug} />
                {club.membershipPolicy === "request" ? (
                  <div className="field">
                    <label htmlFor="message">Why do you want to join? <span className="hint">(optional)</span></label>
                    <textarea className="textarea" id="message" name="message" maxLength={1500} rows={3} />
                  </div>
                ) : null}
                <SubmitButton className="btn btn-primary btn-block">
                  {club.membershipPolicy === "open" ? "Join club" : "Request to join"}
                </SubmitButton>
              </form>
            )}

            {isOfficer ? (
              <Link className="btn btn-secondary btn-block mt-2" href={`/clubs/${club.slug}/manage`}>
                Manage this club
              </Link>
            ) : null}
          </div>

          <div className="card">
            <h2 style={{ fontSize: "1.15rem" }}>Leadership</h2>
            {club.officers.length === 0 ? (
              <p className="small muted">No officers listed.</p>
            ) : (
              club.officers.map((officer) => (
                <div className="member-row" key={officer.userId}>
                  <Avatar name={officer.name} />
                  <div>
                    <div className="small">{officer.name}</div>
                    <div className="tiny muted">{officer.role}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h2 style={{ fontSize: "1.15rem" }}>Details</h2>
            <dl className="fact-list">
              <div className="fact">
                <dt>Founded on CampusSphere</dt>
                <dd>{new Date(club.createdAt).toLocaleDateString("en-GB")}</dd>
              </div>
              {club.websiteUrl ? (
                <div className="fact">
                  <dt>Website</dt>
                  <dd>
                    <a href={club.websiteUrl} rel="noreferrer nofollow noopener" target="_blank">
                      {club.websiteUrl.replace(/^https?:\/\//, "")}
                    </a>
                  </dd>
                </div>
              ) : null}
              {club.contactEmail ? (
                <div className="fact">
                  <dt>Contact</dt>
                  <dd>
                    <a href={`mailto:${club.contactEmail}`}>{club.contactEmail}</a>
                  </dd>
                </div>
              ) : null}
              {club.instagramUrl ? (
                <div className="fact">
                  <dt>Instagram</dt>
                  <dd>
                    <a href={club.instagramUrl} rel="noreferrer nofollow noopener" target="_blank">
                      {club.instagramUrl.replace(/^https?:\/\/(www\.)?instagram\.com\//, "@")}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
            {me ? (
              <details className="mt-2">
                <summary className="small muted" style={{ cursor: "pointer" }}>
                  Report a problem with this page
                </summary>
                <form action={reportAction} className="mt-1">
                  <input type="hidden" name="targetType" value="club" />
                  <input type="hidden" name="targetId" value={club.id} />
                  <input type="hidden" name="returnTo" value={`/clubs/${club.slug}`} />
                  <div className="field">
                    <label htmlFor="reason">Reason</label>
                    <input className="input" id="reason" name="reason" maxLength={120} required />
                  </div>
                  <div className="field">
                    <label htmlFor="details">Details <span className="hint">(optional)</span></label>
                    <textarea className="textarea" id="details" name="details" rows={2} maxLength={2000} />
                  </div>
                  <SubmitButton className="btn btn-secondary btn-sm">Send report</SubmitButton>
                </form>
              </details>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
