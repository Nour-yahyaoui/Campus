import Link from "next/link";
import type { ClubSummary, EventSummary, ProjectSummary } from "@campussphere/contracts";
import { categoryLabel, dayMonth, formatDateRange, formatRelative, initials, monogramClass, numeric } from "@/lib/format";

export function Monogram({ name, size }: { name: string; size?: "lg" }) {
  return (
    <span className={`monogram ${monogramClass(name)}`} aria-hidden="true">
      {initials(name) || "C"}
    </span>
  );
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {initials(name) || "?"}
    </span>
  );
}

export function Tag({ children, tone }: { children: React.ReactNode; tone?: "forest" | "marigold" | "danger" }) {
  return <span className={`tag${tone ? ` tag-${tone}` : ""}`}>{children}</span>;
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children ? <p className="small" style={{ margin: "0 auto", maxWidth: "46ch" }}>{children}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ClubCard({ club }: { club: ClubSummary }) {
  return (
    <Link className="card card-link club-card" href={`/clubs/${club.slug}`}>
      <div className="club-top">
        <Monogram name={club.name} />
        <div>
          <h3>{club.name}</h3>
          <p className="small muted clamp-2" style={{ margin: 0 }}>
            {club.tagline ?? "A student community on CampusSphere."}
          </p>
        </div>
      </div>
      <div className="tag-row">
        <Tag>{categoryLabel(club.category)}</Tag>
        {club.verified ? <Tag tone="forest">Verified</Tag> : null}
        {club.membershipPolicy === "open" ? <Tag tone="marigold">Open to join</Tag> : null}
      </div>
      <div className="card-meta">
        <span>{numeric(club.memberCount)} members</span>
        <span>{numeric(club.upcomingEventCount)} upcoming events</span>
      </div>
    </Link>
  );
}

export function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Link className="card card-link club-card" href={`/projects/${project.slug}`}>
      <div className="club-top">
        <Monogram name={project.title} />
        <div>
          <h3 className="clamp-2">{project.title}</h3>
          <p className="small muted clamp-2" style={{ margin: 0 }}>
            {project.summary}
          </p>
        </div>
      </div>
      <div className="tag-row">
        <Tag>{categoryLabel(project.category)}</Tag>
        {project.club ? <Tag tone="forest">{project.club.name}</Tag> : null}
        {project.openRoles > 0 ? <Tag tone="marigold">{project.openRoles} open role{project.openRoles === 1 ? "" : "s"}</Tag> : null}
      </div>
      <div className="card-meta">
        <span>Led by {project.lead.name}</span>
        <span>{numeric(project.memberCount)} on the team</span>
      </div>
    </Link>
  );
}

export function EventRow({ event, showClub = true }: { event: EventSummary; showClub?: boolean }) {
  const { day, month } = dayMonth(event.startsAt, event.timezone);
  const past = new Date(event.endsAt).getTime() < Date.now();
  return (
    <div className="event-row">
      <div className={`date-chip${past ? " alt" : ""}`} aria-hidden="true">
        <span className="month">{month}</span>
        <span className="day">{day}</span>
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <h3>
          <Link href={`/events/${event.slug}`}>{event.title}</Link>
        </h3>
        <p className="clamp-2">{event.summary}</p>
        <div className="tag-row">
          {showClub && event.club ? <Tag tone="forest">{event.club.name}</Tag> : null}
          <Tag>{categoryLabel(event.category)}</Tag>
          <Tag>{event.isOnline ? "Online" : event.venueName ?? "Venue TBA"}</Tag>
        </div>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          {formatDateRange(event.startsAt, event.endsAt, event.timezone)} ·{" "}
          {event.capacity === null
            ? `${numeric(event.registeredCount)} registered`
            : `${numeric(event.registeredCount)} of ${numeric(event.capacity)} places filled`}
          {event.waitlistCount > 0 ? ` · ${numeric(event.waitlistCount)} waitlisted` : ""}
          {!past ? ` · ${formatRelative(event.startsAt)}` : ""}
        </p>
      </div>
    </div>
  );
}

export function Pager({
  nextCursor,
  basePath,
  params,
}: {
  nextCursor: string | null;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  if (!nextCursor) return null;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  search.set("cursor", nextCursor);
  return (
    <div className="row" style={{ justifyContent: "center", marginTop: 24 }}>
      <Link className="btn btn-secondary" href={`${basePath}?${search.toString()}`}>
        Load more
      </Link>
    </div>
  );
}

export function StatStrip({
  items,
}: {
  items: Array<{ label: string; value: string; hint?: string }>;
}) {
  return (
    <div className="stats-strip">
      {items.map((item) => (
        <div className="stat" key={item.label}>
          <b>{item.value}</b>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Notice({ tone = "success", children }: { tone?: "success" | "danger" | "neutral"; children: React.ReactNode }) {
  if (tone === "neutral") return <div className="callout">{children}</div>;
  return <div className={tone === "danger" ? "alert" : "notice"}>{children}</div>;
}
