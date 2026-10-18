import Link from "next/link";
import type { Metadata } from "next";
import { PRODUCT } from "@campussphere/contracts";
import { listClubs, listEvents, listProjects, siteStats } from "@campussphere/core";
import { ClubCard, EventRow, ProjectCard, StatStrip } from "@/components/Pieces";
import { numeric } from "@/lib/format";

export const metadata: Metadata = {
  title: `${PRODUCT.name} — ${PRODUCT.tagline}`,
  description: PRODUCT.description,
  alternates: { canonical: "/" },
};


export default async function HomePage() {
  const [clubs, events, projects, stats] = await Promise.all([
    listClubs({ limit: 3 }).catch(() => ({ items: [], nextCursor: null })),
    listEvents({ limit: 4, when: "upcoming" }).catch(() => ({ items: [], nextCursor: null })),
    listProjects({ limit: 3 }).catch(() => ({ items: [], nextCursor: null })),
    siteStats().catch(() => ({ clubs: 0, projects: 0, events: 0, members: 0, confirmedAttendance: 0, asOf: new Date().toISOString() })),
  ]);

  const nextEvent = events.items[0];

  return (
    <>
      <section className="hero">
        <div className="shell">
          <div className="hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">Student life, organised</p>
              <h1>
                The campus is <em>already</em> happening.
              </h1>
              <p className="lede">
                Find the clubs worth showing up for, the projects that need your skills, and the events
                your friends will talk about. Browse everything without an account.
              </p>
              <div className="hero-actions">
                <Link className="btn btn-primary" href="/events">
                  Explore events
                </Link>
                <Link className="btn btn-secondary" href="/clubs">
                  Browse clubs
                </Link>
              </div>
              <p className="hero-note">
                Free and open source · Google sign-in only when you apply, join or register
              </p>
            </div>
            <div className="hero-art" aria-label="A preview of campus activity">
              <div className="hero-mini">
                <div className="date-chip">
                  <span className="month">Live</span>
                  <span className="day">{stats.clubs}</span>
                </div>
                <div>
                  <strong>Clubs already listed</strong>
                  <span>Each with a public mini-site</span>
                </div>
              </div>
              {nextEvent ? (
                <div className="hero-mini">
                  <div className="date-chip alt">
                    <span className="month">Next</span>
                    <span className="day">{new Date(nextEvent.startsAt).getDate()}</span>
                  </div>
                  <div>
                    <strong className="clamp-2">{nextEvent.title}</strong>
                    <span>{nextEvent.club?.name ?? "Campus event"}</span>
                  </div>
                </div>
              ) : null}
              <div className="hero-mini">
                <div className="date-chip">
                  <span className="month">Team</span>
                  <span className="day">{stats.projects}</span>
                </div>
                <div>
                  <strong>Approved projects</strong>
                  <span>Reviewed before they go public</span>
                </div>
              </div>
              <p className="tiny muted" style={{ margin: 0 }}>
                These counters read from this deployment&apos;s database. Nothing here is simulated.
              </p>
            </div>
          </div>

          <StatStrip
            items={[
              { label: "Active clubs", value: numeric(stats.clubs) },
              { label: "Approved projects", value: numeric(stats.projects) },
              { label: "Published events", value: numeric(stats.events) },
              { label: "Students & staff", value: numeric(stats.members) },
            ]}
          />
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section-head">
            <div>
              <p className="eyebrow">What&apos;s next</p>
              <h2>Upcoming on campus</h2>
              <p>Workshops, demos, meetups and the occasional free pizza.</p>
            </div>
            <Link className="btn btn-secondary btn-sm" href="/events">
              All events
            </Link>
          </div>
          {events.items.length === 0 ? (
            <div className="empty">
              <h3>No published events yet</h3>
              <p className="small">When organizers publish an approved event, it appears here.</p>
            </div>
          ) : (
            <div className="card card-flat">
              {events.items.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section-head">
            <div>
              <p className="eyebrow">Find your people</p>
              <h2>Clubs with open doors</h2>
              <p>Open clubs let you join instantly. Others review a short request.</p>
            </div>
            <Link className="btn btn-secondary btn-sm" href="/clubs">
              All clubs
            </Link>
          </div>
          {clubs.items.length === 0 ? (
            <div className="empty">
              <h3>No clubs listed yet</h3>
              <p className="small">A super-admin seeds the first clubs for a pilot.</p>
            </div>
          ) : (
            <div className="grid-3">
              {clubs.items.map((club) => (
                <ClubCard key={club.id} club={club} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section-head">
            <div>
              <p className="eyebrow">Build something</p>
              <h2>Projects looking for hands</h2>
              <p>Every project is reviewed before it appears publicly.</p>
            </div>
            <Link className="btn btn-secondary btn-sm" href="/projects">
              All projects
            </Link>
          </div>
          {projects.items.length === 0 ? (
            <div className="empty">
              <h3>No approved projects yet</h3>
              <p className="small">Students and clubs can propose a project from their dashboard.</p>
            </div>
          ) : (
            <div className="grid-3">
              {projects.items.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="panel" style={{ background: "var(--forest)", color: "#fffdf8", borderColor: "var(--forest-dark)" }}>
            <div className="split">
              <div>
                <p className="eyebrow" style={{ color: "#e7c79a" }}>
                  How it works
                </p>
                <h2 style={{ color: "#fffdf8", fontSize: "clamp(1.6rem, 4vw, 2.2rem)" }}>
                  Browse as a guest. Sign in only when it counts.
                </h2>
                <p style={{ color: "#d9e3d9", maxWidth: "60ch" }}>
                  Reading club pages, event details and project descriptions never requires an account.
                  Google sign-in is used for applications, registrations, posts and roles — and sessions
                  live in secure, HttpOnly cookies, never in browser storage.
                </p>
              </div>
              <div className="stack">
                <Link className="btn" href="/dashboard/projects/new" style={{ background: "#fffdf8", color: "var(--forest-dark)" }}>
                  Propose a project
                </Link>
                <Link className="btn" href="/dashboard/events/new" style={{ background: "#e7c79a", color: "#3b2a10" }}>
                  Propose an event
                </Link>
                <Link className="btn" href="/about" style={{ background: "transparent", color: "#fffdf8", borderColor: "#6a8a77" }}>
                  Read the honest status page
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
