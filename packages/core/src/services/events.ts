import type {
  EventAttendee,
  EventDetail,
  EventFeedback,
  EventRegistrationView,
  EventSummary,
  Paginated,
  RegistrationStatus,
} from "@campussphere/contracts";
import type pg from "pg";
import type { z } from "zod";
import type { eventProposalInput, eventUpdateInput } from "@campussphere/contracts";
import { randomToken, hashToken, isSuperAdmin, type Me } from "../auth";
import { writeAudit } from "../audit";
import { decodeCursor, encodeCursor, iso, isoRequired, likePattern, many, one, pageLimit, query, transaction, uniqueSlug } from "../db";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../errors";
import { notify, notifyMany } from "../notifications";
import { enqueueEmail } from "../jobs";
import { isClubOfficer } from "./clubs";
import { siteUrl } from "../env";

type ProposalInput = z.infer<typeof eventProposalInput>;
type EventPatch = z.infer<typeof eventUpdateInput>;

interface EventRow {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: EventSummary["category"];
  status: EventSummary["status"];
  starts_at: Date;
  ends_at: Date;
  timezone: string;
  venue_name: string | null;
  online_url: string | null;
  capacity: number | null;
  cover_url: string | null;
  created_by: string;
  waitlist_enabled: boolean;
  club_id: string | null;
  club_slug: string | null;
  club_name: string | null;
  registered_count: number;
  waitlist_count: number;
}

const eventSelect = `
  e.id, e.slug, e.title, e.summary, e.category, e.status, e.starts_at, e.ends_at, e.timezone,
  e.venue_name, e.online_url, e.capacity, e.cover_url, e.created_by, e.waitlist_enabled,
  e.club_id, c.slug as club_slug, c.name as club_name,
  (select count(*)::int from event_registrations r
    where r.event_id = e.id and r.status in ('registered','attended')) as registered_count,
  (select count(*)::int from event_registrations r
    where r.event_id = e.id and r.status = 'waitlisted') as waitlist_count
`;

function toSummary(row: EventRow): EventSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category,
    status: row.status,
    startsAt: isoRequired(row.starts_at),
    endsAt: isoRequired(row.ends_at),
    timezone: row.timezone,
    venueName: row.venue_name,
    isOnline: Boolean(row.online_url) && !row.venue_name,
    capacity: row.capacity,
    registeredCount: row.registered_count,
    waitlistCount: row.waitlist_count,
    coverUrl: row.cover_url,
    club: row.club_id ? { id: row.club_id, slug: row.club_slug!, name: row.club_name! } : null,
  };
}

/* ------------------------------------------------------------------ */
/* Discovery                                                           */
/* ------------------------------------------------------------------ */

export async function listEvents(options: {
  category?: string;
  q?: string;
  when?: "upcoming" | "past" | "all";
  clubSlug?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<Paginated<EventSummary>> {
  const limit = pageLimit(options.limit);
  const cursor = decodeCursor(options.cursor);
  const when = options.when ?? "upcoming";
  const values: unknown[] = [limit + 1];
  // `completed` is the status an event keeps once it has happened; the past view
  // and the detail page both treat it as public, so the listing must too.
  const where = ["e.status in ('published', 'completed')"];
  if (when === "upcoming") where.push("e.ends_at >= now()");
  if (when === "past") where.push("e.ends_at < now()");
  if (options.category) {
    values.push(options.category);
    where.push(`e.category = $${values.length}`);
  }
  if (options.q) {
    values.push(likePattern(options.q));
    where.push(`(e.title ilike $${values.length} or e.summary ilike $${values.length} or e.venue_name ilike $${values.length})`);
  }
  if (options.clubSlug) {
    values.push(options.clubSlug);
    where.push(`c.slug = $${values.length}`);
  }
  if (cursor) {
    // Ordering mirrors the direction of travel so cursors stay stable.
    if (when === "past") {
      values.push(cursor.at, cursor.id);
      where.push(`(e.starts_at, e.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
    } else {
      values.push(cursor.at, cursor.id);
      where.push(`(e.starts_at, e.id) > ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
    }
  }
  const order = when === "past" ? "e.starts_at desc, e.id desc" : "e.starts_at asc, e.id asc";
  const rows = await many<EventRow>(
    `select ${eventSelect}
       from events e left join clubs c on c.id = e.club_id
      where ${where.join(" and ")}
      order by ${order}
      limit $1`,
    values,
  );
  const items = rows.slice(0, limit).map(toSummary);
  const last = rows.length > limit ? rows[limit - 1] : null;
  return { items, nextCursor: last ? encodeCursor(last.starts_at, last.id) : null };
}

interface EventDetailRow extends EventRow {
  description: string;
  venue_address: string | null;
  accessibility_notes: string | null;
  contact_email: string | null;
  decision_notes: string | null;
}

export async function getEventBySlug(slug: string, viewer: Me | null): Promise<EventDetail> {
  const row = await one<EventDetailRow>(
    `select ${eventSelect}, e.description, e.venue_address, e.accessibility_notes,
            e.contact_email, e.decision_notes
       from events e left join clubs c on c.id = e.club_id
      where e.slug = $1`,
    [slug],
  );
  if (!row) throw notFound("This event does not exist.");

  const isPublic = row.status === "published" || row.status === "completed";
  const organizerIds = await many<{ user_id: string }>(
    "select user_id from event_organizers where event_id = $1",
    [row.id],
  );
  const isOrganizer =
    Boolean(viewer) &&
    (viewer!.id === row.created_by ||
      organizerIds.some((organizer) => organizer.user_id === viewer!.id) ||
      (row.club_id ? await isClubOfficer(row.club_id, viewer!.id) : false));
  if (!isPublic && !isOrganizer && !isSuperAdmin(viewer)) {
    throw notFound("This event does not exist.");
  }

  const [organizers, registration, feedback] = await Promise.all([
    many<{ id: string; name: string; avatar_url: string | null; bio: string | null }>(
      `select u.id, u.name, u.avatar_url, u.bio
         from event_organizers eo join users u on u.id = eo.user_id
        where eo.event_id = $1
        union
        select u.id, u.name, u.avatar_url, u.bio from users u where u.id = $2`,
      [row.id, row.created_by],
    ),
    viewer
      ? one<{ id: string; status: RegistrationStatus; created_at: Date; position: number | null }>(
          `select id, status, created_at, position from event_registrations
            where event_id = $1 and user_id = $2 and status in ('registered','waitlisted','attended')
            order by created_at desc limit 1`,
          [row.id, viewer.id],
        )
      : Promise.resolve(null),
    viewer
      ? one<{ rating: number; comment: string | null }>(
          "select rating, comment from event_feedback where event_id = $1 and user_id = $2",
          [row.id, viewer.id],
        )
      : Promise.resolve(null),
  ]);

  return {
    ...toSummary(row),
    description: row.description,
    venueAddress: row.venue_address,
    onlineUrl: row.online_url,
    accessibilityNotes: row.accessibility_notes,
    contactEmail: row.contact_email,
    organizers: organizers.map((organizer) => ({
      id: organizer.id,
      name: organizer.name,
      avatarUrl: organizer.avatar_url,
      bio: organizer.bio,
    })),
    registration: registration
      ? {
          id: registration.id,
          status: registration.status,
          createdAt: isoRequired(registration.created_at),
          position: registration.status === "waitlisted" ? registration.position : null,
        }
      : null,
    feedback: feedback ? { rating: feedback.rating, comment: feedback.comment } : null,
  };
}

/* ------------------------------------------------------------------ */
/* Authorization                                                       */
/* ------------------------------------------------------------------ */

async function loadEvent(eventId: string) {
  const row = await one<{
    id: string;
    slug: string;
    title: string;
    status: string;
    created_by: string;
    club_id: string | null;
    starts_at: Date;
    ends_at: Date;
  }>("select id, slug, title, status, created_by, club_id, starts_at, ends_at from events where id = $1", [
    eventId,
  ]);
  if (!row) throw notFound("Event not found");
  return row;
}

export async function canManageEvent(eventId: string, me: Me | null): Promise<boolean> {
  if (!me) return false;
  if (isSuperAdmin(me)) return true;
  const event = await loadEvent(eventId);
  if (event.created_by === me.id) return true;
  const organizer = await one("select 1 from event_organizers where event_id = $1 and user_id = $2", [
    eventId,
    me.id,
  ]);
  if (organizer) return true;
  return event.club_id ? isClubOfficer(event.club_id, me.id) : false;
}

async function requireEventManager(eventId: string, me: Me) {
  const allowed = await canManageEvent(eventId, me);
  if (!allowed) throw forbidden("Only the organizers of this event can do that.");
  return loadEvent(eventId);
}

async function assertClubAffiliation(clubId: string | null | undefined, me: Me): Promise<void> {
  if (!clubId) return;
  if (isSuperAdmin(me)) return;
  if (!(await isClubOfficer(clubId, me.id))) {
    throw forbidden("Only an officer of that club can organize on its behalf.");
  }
}

/* ------------------------------------------------------------------ */
/* Proposals                                                           */
/* ------------------------------------------------------------------ */

export async function createEvent(me: Me, input: ProposalInput): Promise<{ id: string; slug: string; status: string }> {
  await assertClubAffiliation(input.clubId, me);
  const slug = await uniqueSlug("events", input.title);
  const status = input.submit ? "submitted" : "draft";
  const submittedAt = input.submit ? new Date() : null;
  const id = await transaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `insert into events (slug, club_id, created_by, title, summary, description, category, status,
                           starts_at, ends_at, timezone, venue_name, venue_address, online_url,
                           capacity, waitlist_enabled, accessibility_notes, contact_email, cover_url, submitted_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       returning id`,
      [
        slug,
        input.clubId ?? null,
        me.id,
        input.title,
        input.summary,
        input.description,
        input.category,
        status,
        input.startsAt,
        input.endsAt,
        input.timezone,
        input.venueName ?? null,
        input.venueAddress ?? null,
        input.onlineUrl ?? null,
        input.capacity ?? null,
        input.waitlistEnabled ?? true,
        input.accessibilityNotes ?? null,
        input.contactEmail || null,
        input.coverUrl ?? null,
        submittedAt,
      ],
    );
    const eventId = inserted.rows[0]!.id;
    await client.query("insert into event_organizers (event_id, user_id) values ($1,$2)", [eventId, me.id]);
    await writeAudit(
      {
        actorId: me.id,
        action: input.submit ? "event.submitted" : "event.created",
        entityType: "event",
        entityId: eventId,
        metadata: { title: input.title, clubId: input.clubId ?? null },
      },
      client,
    );
    return eventId;
  });
  return { id, slug, status };
}

export async function updateEvent(eventId: string, me: Me, patch: EventPatch): Promise<void> {
  // Permission first (a read), then one transaction that locks the event row.
  // The capacity check used to run outside any lock, so a registration landing
  // between the count and the update could leave capacity below the number of
  // confirmed seats.
  await requireEventManager(eventId, me);
  if (patch.clubId !== undefined) await assertClubAffiliation(patch.clubId, me);
  const submit = patch.submit === true;

  const columns: Record<string, string> = {
    title: "title",
    summary: "summary",
    description: "description",
    category: "category",
    startsAt: "starts_at",
    endsAt: "ends_at",
    timezone: "timezone",
    venueName: "venue_name",
    venueAddress: "venue_address",
    onlineUrl: "online_url",
    capacity: "capacity",
    waitlistEnabled: "waitlist_enabled",
    accessibilityNotes: "accessibility_notes",
    contactEmail: "contact_email",
    clubId: "club_id",
    coverUrl: "cover_url",
  };

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(columns)) {
    if (key in patch) {
      values.push((patch as Record<string, unknown>)[key] ?? null);
      sets.push(`${column} = $${values.length}`);
    }
  }

  const touchesCapacity = "capacity" in patch || "waitlistEnabled" in patch;

  await transaction(async (client) => {
    const locked = await client.query<{ capacity: number | null; status: string }>(
      "select capacity, status from events where id = $1 for update",
      [eventId],
    );
    const current = locked.rows[0];
    if (!current) throw notFound("Event not found");
    if (["cancelled", "completed"].includes(current.status)) {
      throw conflict("This event can no longer be edited.");
    }

    if (patch.capacity !== undefined && patch.capacity !== null) {
      const active = await client.query<{ n: number }>(
        "select count(*)::int as n from event_registrations where event_id = $1 and status in ('registered','attended')",
        [eventId],
      );
      if ((active.rows[0]?.n ?? 0) > patch.capacity) {
        throw conflict(`Capacity cannot be lower than the ${active.rows[0]!.n} people already registered.`);
      }
    }

    if (sets.length > 0) {
      await client.query(`update events set ${sets.join(", ")} where id = $${values.length + 1}`, [
        ...values,
        eventId,
      ]);
    }

    // Raising capacity (or removing it, or re-opening the waitlist) can free
    // seats that earlier waitlisted people should get first — otherwise the
    // queue only ever moves when somebody cancels.
    if (touchesCapacity) {
      const fresh = await client.query<{ id: string; title: string; slug: string; capacity: number | null }>(
        "select id, title, slug, capacity from events where id = $1",
        [eventId],
      );
      if (fresh.rows[0]) await promoteWaitlist(client, fresh.rows[0], me.id);
    }

    if (submit) {
      if (!["draft", "changes_requested", "rejected"].includes(current.status)) {
        throw conflict("Only drafts or changes-requested events can be submitted.");
      }
      await client.query(
        "update events set status = 'submitted', submitted_at = now(), decision_notes = null where id = $1",
        [eventId],
      );
      await writeAudit(
        { actorId: me.id, action: "event.submitted", entityType: "event", entityId: eventId },
        client,
      );
    } else if (sets.length > 0) {
      await writeAudit(
        {
          actorId: me.id,
          action: "event.updated",
          entityType: "event",
          entityId: eventId,
          metadata: { fields: Object.keys(patch) },
        },
        client,
      );
    }
  });
}

export async function decideEvent(
  eventId: string,
  me: Me,
  decision: "approve" | "reject" | "request_changes",
  notes?: string | null,
): Promise<void> {
  if (!isSuperAdmin(me)) throw forbidden("Only a super-admin can review event proposals.");
  const event = await one<{
    id: string;
    slug: string;
    title: string;
    created_by: string;
    status: string;
    email: string;
    name: string;
  }>(
    `select e.id, e.slug, e.title, e.created_by, e.status, u.email, u.name
       from events e join users u on u.id = e.created_by where e.id = $1`,
    [eventId],
  );
  if (!event) throw notFound("Event not found");
  if (event.status === "draft") throw conflict("This event has not been submitted yet.");

  const status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "changes_requested";
  await query(
    `update events set status = $2, decision_notes = $3, decided_by = $4, decided_at = now() where id = $1`,
    [event.id, status, notes ?? null, me.id],
  );
  await writeAudit({
    actorId: me.id,
    action: "event.decision",
    entityType: "event",
    entityId: event.id,
    metadata: { decision, notes: notes ?? null },
  });
  const title =
    decision === "approve"
      ? `Your event "${event.title}" was approved`
      : decision === "reject"
        ? `Your event "${event.title}" was not approved`
        : `Changes requested for "${event.title}"`;
  await notify({
    userId: event.created_by,
    kind: "event_decision",
    title,
    body: notes || (decision === "approve" ? "Publish it when you are ready." : "See the review notes."),
    link: `/dashboard/events/${event.id}`,
  });
  await enqueueEmail(event.email, title, `Hi ${event.name},\n\n${title}.\n${notes ? `\nNotes:\n${notes}\n` : ""}`);
}

export async function publishEvent(eventId: string, me: Me): Promise<void> {
  const event = await requireEventManager(eventId, me);
  if (event.status !== "approved") {
    throw conflict("Only approved events can be published.");
  }
  if (event.ends_at.getTime() < Date.now()) throw conflict("This event has already ended.");
  await query("update events set status = 'published', published_at = now() where id = $1", [eventId]);
  await writeAudit({ actorId: me.id, action: "event.published", entityType: "event", entityId: eventId });
  if (event.club_id) {
    const members = await many<{ user_id: string }>(
      "select user_id from club_memberships where club_id = $1 and status = 'active'",
      [event.club_id],
    );
    await notifyMany(
      members.map((member) => member.user_id).filter((id) => id !== me.id),
      {
        kind: "announcement",
        title: `New event: ${event.title}`,
        body: "A club you follow published a new event.",
        link: `/events/${event.slug}`,
      },
    );
  }
}

export async function cancelEvent(eventId: string, me: Me, reason: string): Promise<void> {
  const event = await requireEventManager(eventId, me);
  if (event.status === "cancelled") throw conflict("This event is already cancelled.");
  await query(
    "update events set status = 'cancelled', cancelled_at = now(), cancellation_reason = $2 where id = $1",
    [eventId, reason],
  );
  await writeAudit({
    actorId: me.id,
    action: "event.cancelled",
    entityType: "event",
    entityId: eventId,
    metadata: { reason },
  });
  const registrants = await many<{ user_id: string; email: string; name: string }>(
    `select r.user_id, u.email, u.name from event_registrations r join users u on u.id = r.user_id
      where r.event_id = $1 and r.status in ('registered','waitlisted','attended')`,
    [eventId],
  );
  await notifyMany(
    registrants.map((registrant) => registrant.user_id),
    {
      kind: "event_cancelled",
      title: `${event.title} was cancelled`,
      body: reason,
      link: `/events/${event.slug}`,
    },
  );
  for (const registrant of registrants) {
    await enqueueEmail(
      registrant.email,
      `${event.title} was cancelled`,
      `Hi ${registrant.name},\n\nThe organizers cancelled ${event.title}.\nReason: ${reason}\n`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Registration & waitlist                                             */
/* ------------------------------------------------------------------ */

interface WaitlistEvent {
  id: string;
  title: string;
  slug: string;
  capacity: number | null;
}

/**
 * Moves people off the waitlist, in queue order, while seats are free.
 *
 * The caller must already hold the event row lock (`select … for update`), so
 * a concurrent registration cannot take a seat between the count and the
 * promotion. `skip locked` keeps two simultaneous cancellations from promoting
 * the same person twice.
 */
async function promoteWaitlist(
  client: pg.PoolClient,
  event: WaitlistEvent,
  actorId: string | null,
): Promise<number> {
  const confirmed = await client.query<{ n: number }>(
    `select count(*)::int as n from event_registrations
      where event_id = $1 and status in ('registered','attended')`,
    [event.id],
  );
  const taken = confirmed.rows[0]?.n ?? 0;
  // Unlimited capacity promotes the whole (bounded) queue.
  const free = event.capacity === null ? 500 : Math.max(0, event.capacity - taken);
  if (free === 0) return 0;

  const queue = await client.query<{ id: string; user_id: string; email: string; name: string }>(
    `select r.id, r.user_id, u.email, u.name
       from event_registrations r join users u on u.id = r.user_id
      where r.event_id = $1 and r.status = 'waitlisted'
      order by r.position asc nulls last, r.created_at asc
      limit $2
      for update of r skip locked`,
    [event.id, free],
  );

  for (const person of queue.rows) {
    await client.query(
      `update event_registrations
          set status = 'registered', promoted_from_waitlist_at = now(), position = null
        where id = $1`,
      [person.id],
    );
    await client.query(
      `insert into notifications (user_id, kind, title, body, link)
       values ($1, 'event_promoted', $2, $3, $4)`,
      [
        person.user_id,
        `A place opened for ${event.title}`,
        "You were moved from the waitlist. Your spot is confirmed.",
        `/events/${event.slug}`,
      ],
    );
    await client.query(`insert into jobs (kind, payload, max_attempts) values ('email', $1, 6)`, [
      JSON.stringify({
        to: person.email,
        subject: `A place opened for ${event.title}`,
        text: `Hi ${person.name},\n\nYou were promoted from the waitlist for ${event.title}.\nDetails: ${siteUrl()}/events/${event.slug}`,
      }),
    ]);
    await writeAudit(
      {
        actorId,
        action: "event.registration_promoted",
        entityType: "event",
        entityId: event.id,
        metadata: { promotedUserId: person.user_id },
      },
      client,
    );
  }
  return queue.rows.length;
}

export async function registerForEvent(
  eventId: string,
  me: Me,
): Promise<EventRegistrationView> {
  return transaction(async (client) => {
    // Serialise all registration decisions for this event. This lock is the
    // guarantee that capacity is never oversubscribed under concurrency.
    const locked = await client.query<{
      id: string;
      title: string;
      slug: string;
      status: string;
      capacity: number | null;
      waitlist_enabled: boolean;
      starts_at: Date;
      ends_at: Date;
    }>(
      `select id, title, slug, status, capacity, waitlist_enabled, starts_at, ends_at
         from events where id = $1 for update`,
      [eventId],
    );
    const eventRow = locked.rows[0];
    if (!eventRow) throw notFound("Event not found");
    if (eventRow.status !== "published") throw conflict("Registration is not open for this event.");
    if (eventRow.ends_at.getTime() < Date.now()) throw conflict("This event has already ended.");

    const existing = await client.query<{ id: string; status: RegistrationStatus; position: number | null; created_at: Date }>(
      `select id, status, position, created_at from event_registrations
        where event_id = $1 and user_id = $2 and status in ('registered','waitlisted','attended')`,
      [eventId, me.id],
    );
    if (existing.rows[0]) {
      return {
        id: existing.rows[0].id,
        status: existing.rows[0].status,
        createdAt: isoRequired(existing.rows[0].created_at),
        position: existing.rows[0].position,
      } satisfies EventRegistrationView;
    }

    const count = await client.query<{ n: number }>(
      `select count(*)::int as n from event_registrations
        where event_id = $1 and status in ('registered','attended')`,
      [eventId],
    );
    const confirmed = count.rows[0]?.n ?? 0;
    const waiting = await client.query<{ n: number }>(
      "select count(*)::int as n from event_registrations where event_id = $1 and status = 'waitlisted'",
      [eventId],
    );
    const queued = waiting.rows[0]?.n ?? 0;
    const seatFree = eventRow.capacity === null || confirmed < eventRow.capacity;
    // A free seat is not this person's if somebody is already queued for it.
    // Without this check, raising capacity let newcomers jump the waitlist.
    const hasSpace = seatFree && queued === 0;

    if (!hasSpace && !eventRow.waitlist_enabled) {
      throw conflict("This event is full.");
    }

    const status: RegistrationStatus = hasSpace ? "registered" : "waitlisted";
    let position: number | null = null;
    if (!hasSpace) {
      const tail = await client.query<{ max: number | null }>(
        "select max(position) as max from event_registrations where event_id = $1 and status = 'waitlisted'",
        [eventId],
      );
      position = (tail.rows[0]?.max ?? 0) + 1;
    }

    const inserted = await client.query<{ id: string; created_at: Date }>(
      `insert into event_registrations (event_id, user_id, status, position)
       values ($1,$2,$3,$4) returning id, created_at`,
      [eventId, me.id, status, position],
    );
    await client.query(
      `insert into notifications (user_id, kind, title, body, link)
       values ($1, $2, $3, $4, $5)`,
      [
        me.id,
        hasSpace ? "event_registration_confirmed" : "event_waitlisted",
        hasSpace ? `You're registered for ${eventRow.title}` : `You're on the waitlist for ${eventRow.title}`,
        hasSpace ? "We'll remind you before it starts." : "We'll email you if a place opens up.",
        `/events/${eventRow.slug}`,
      ],
    );
    await writeAudit(
      {
        actorId: me.id,
        action: "event.registration_created",
        entityType: "event",
        entityId: eventId,
        metadata: { status, position },
      },
      client,
    );

    // Inside the transaction on purpose: an email-queue hiccup used to be
    // reported to the user as "registration failed" even though the seat had
    // already been committed.
    if (status === "registered") {
      const email = await client.query<{ email: string; name: string }>(
        "select email, name from users where id = $1",
        [me.id],
      );
      if (email.rows[0]) {
        await client.query(`insert into jobs (kind, payload, max_attempts) values ('email', $1, 6)`, [
          JSON.stringify({
            to: email.rows[0].email,
            subject: `You're registered for ${eventRow.title}`,
            text: `Hi ${email.rows[0].name},\n\nYour place at ${eventRow.title} is confirmed.\nDetails: ${siteUrl()}/events/${eventRow.slug}`,
          }),
        ]);
      }
    }

    return {
      id: inserted.rows[0]!.id,
      status,
      createdAt: isoRequired(inserted.rows[0]!.created_at),
      position,
    } satisfies EventRegistrationView;
  });
}

export async function cancelRegistration(eventId: string, me: Me): Promise<void> {
  await transaction(async (client) => {
    const event = await client.query<{
      id: string;
      title: string;
      slug: string;
      capacity: number | null;
      waitlist_enabled: boolean;
    }>(
      "select id, title, slug, capacity, waitlist_enabled from events where id = $1 for update",
      [eventId],
    );
    if (!event.rows[0]) throw notFound("Event not found");

    const current = await client.query<{ id: string; status: RegistrationStatus }>(
      `select id, status from event_registrations
        where event_id = $1 and user_id = $2 and status in ('registered','waitlisted','attended')
        for update`,
      [eventId, me.id],
    );
    const cancelled = current.rows[0];
    if (!cancelled) throw notFound("You are not registered for this event.");
    // Attendance is a record, not a reservation: cancelling it would free a
    // seat the person already used and promote someone into an event that has
    // happened. Organizers can adjust the roster explicitly.
    if (cancelled.status === "attended") {
      throw conflict("Your attendance is already recorded. Ask an organizer to remove it.");
    }

    await client.query(
      "update event_registrations set status = 'cancelled', cancelled_at = now() where id = $1",
      [cancelled.id],
    );

    await writeAudit(
      {
        actorId: me.id,
        action: "event.registration_cancelled",
        entityType: "event",
        entityId: eventId,
        metadata: { previousStatus: cancelled.status },
      },
      client,
    );

    // A freed seat promotes the first person on the waitlist, atomically.
    const wasConfirmed = cancelled.status === "registered";
    if (!wasConfirmed) return;
    await promoteWaitlist(client, event.rows[0], me.id);
  });
}

/* ------------------------------------------------------------------ */
/* Organizer tooling                                                   */
/* ------------------------------------------------------------------ */

export async function listRoster(eventId: string, me: Me, status?: string): Promise<EventAttendee[]> {
  await requireEventManager(eventId, me);
  const rows = await many<{
    registration_id: string;
    status: RegistrationStatus;
    created_at: Date;
    checked_in_at: Date | null;
    user_id: string;
    name: string;
    avatar_url: string | null;
  }>(
    `select r.id as registration_id, r.status, r.created_at,
            (select min(t.used_at) from attendance_tokens t where t.registration_id = r.id) as checked_in_at,
            u.id as user_id, u.name, u.avatar_url
       from event_registrations r join users u on u.id = r.user_id
      where r.event_id = $1
        and ($2::registration_status is null or r.status = $2::registration_status)
      order by case r.status
                 when 'registered' then 0 when 'waitlisted' then 1 when 'attended' then 2
                 when 'no_show' then 3 else 4 end,
               r.position asc nulls last, r.created_at asc`,
    [eventId, status ?? null],
  );
  return rows.map((row) => ({
    registrationId: row.registration_id,
    user: { id: row.user_id, name: row.name, avatarUrl: row.avatar_url, bio: null },
    status: row.status,
    createdAt: isoRequired(row.created_at),
    checkInCode: null,
    checkedInAt: iso(row.checked_in_at),
  }));
}

/**
 * Creates a single-use check-in token for one attendee. The raw token is
 * returned exactly once to the organizer (encoded in a QR code client-side);
 * only its hash is stored, and it expires in two hours.
 */
async function mintAttendanceToken(
  registration: { id: string; status: RegistrationStatus },
): Promise<{ code: string; expiresAt: string }> {
  if (!["registered", "attended"].includes(registration.status)) {
    throw conflict("Only confirmed attendees get a check-in code.");
  }
  const code = randomToken(24);
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  await query(
    `insert into attendance_tokens (registration_id, token_hash, expires_at) values ($1,$2,$3)`,
    [registration.id, hashToken(code), expiresAt],
  );
  return { code, expiresAt: expiresAt.toISOString() };
}

export async function createAttendanceToken(
  eventId: string,
  registrationId: string,
  me: Me,
): Promise<{ code: string; expiresAt: string }> {
  await requireEventManager(eventId, me);
  const registration = await one<{ id: string; status: RegistrationStatus }>(
    "select id, status from event_registrations where id = $1 and event_id = $2",
    [registrationId, eventId],
  );
  if (!registration) throw notFound("Registration not found");
  return mintAttendanceToken(registration);
}

/**
 * An attendee can mint their own short-lived check-in code. The code is shown
 * as a QR on their ticket page and can only be redeemed once, by an organizer.
 */
export async function createSelfAttendanceToken(
  eventId: string,
  me: Me,
): Promise<{ code: string; expiresAt: string; eventTitle: string; eventSlug: string }> {
  const registration = await one<{
    id: string;
    status: RegistrationStatus;
    title: string;
    slug: string;
  }>(
    `select r.id, r.status, e.title, e.slug
       from event_registrations r join events e on e.id = r.event_id
      where r.event_id = $1 and r.user_id = $2 and r.status in ('registered','attended')`,
    [eventId, me.id],
  );
  if (!registration) throw notFound("You are not confirmed for this event.");
  const minted = await mintAttendanceToken(registration);
  return { ...minted, eventTitle: registration.title, eventSlug: registration.slug };
}

export async function checkIn(code: string, me: Me): Promise<{ attendeeName: string; eventId: string }> {
  if (!me) throw unauthorized();
  const row = await one<{
    token_id: string;
    registration_id: string;
    expires_at: Date;
    used_at: Date | null;
    event_id: string;
    event_status: string;
    user_id: string;
    attendee_name: string;
    status: RegistrationStatus;
  }>(
    `select t.id as token_id, t.registration_id, t.expires_at, t.used_at,
            r.event_id, e.status as event_status, r.user_id, u.name as attendee_name, r.status
       from attendance_tokens t
       join event_registrations r on r.id = t.registration_id
       join events e on e.id = r.event_id
       join users u on u.id = r.user_id
      where t.token_hash = $1`,
    [hashToken(code)],
  );
  if (!row) throw notFound("This check-in code is not valid.");
  if (row.used_at) throw conflict("This check-in code was already used.");
  if (row.expires_at.getTime() < Date.now()) throw conflict("This check-in code expired.");
  if (!["registered", "attended"].includes(row.status)) throw conflict("This attendee is not confirmed.");
  // A cancelled or unpublished event must not accumulate attendance records
  // just because a code minted earlier is still inside its two-hour window.
  if (!["published", "completed"].includes(row.event_status)) {
    throw conflict("Check-in is closed for this event.");
  }

  const allowed = await canManageEvent(row.event_id, me);
  if (!allowed) throw forbidden("Only the event organizers can check people in.");

  await transaction(async (client) => {
    const used = await client.query(
      "update attendance_tokens set used_at = now() where id = $1 and used_at is null",
      [row.token_id],
    );
    if (used.rowCount !== 1) throw conflict("This check-in code was already used.");
    await client.query("update event_registrations set status = 'attended' where id = $1", [row.registration_id]);
    await writeAudit(
      {
        actorId: me.id,
        action: "event.check_in",
        entityType: "event",
        entityId: row.event_id,
        metadata: { registrationId: row.registration_id, attendeeId: row.user_id },
      },
      client,
    );
  });
  return { attendeeName: row.attendee_name, eventId: row.event_id };
}

export async function submitFeedback(
  eventId: string,
  me: Me,
  input: { rating: number; comment?: string | null },
): Promise<void> {
  const event = await one<{ id: string; ends_at: Date; status: string }>(
    "select id, ends_at, status from events where id = $1",
    [eventId],
  );
  if (!event) throw notFound("Event not found");
  if (event.ends_at.getTime() > Date.now()) throw conflict("Feedback opens after the event ends.");
  if (!["published", "completed", "cancelled"].includes(event.status)) throw conflict("Feedback is closed.");
  const attended = await one<{ status: RegistrationStatus }>(
    "select status from event_registrations where event_id = $1 and user_id = $2 and status = 'attended'",
    [eventId, me.id],
  );
  if (!attended) throw forbidden("Only attendees can leave feedback.");
  await query(
    `insert into event_feedback (event_id, user_id, rating, comment)
     values ($1,$2,$3,$4)
     on conflict (event_id, user_id)
     do update set rating = excluded.rating, comment = excluded.comment, created_at = now()`,
    [eventId, me.id, input.rating, input.comment ?? null],
  );
  await writeAudit({
    actorId: me.id,
    action: "event.feedback_submitted",
    entityType: "event",
    entityId: eventId,
    metadata: { rating: input.rating },
  });
}

export async function listEventFeedback(eventId: string, me: Me): Promise<EventFeedback[]> {
  await requireEventManager(eventId, me);
  const rows = await many<{
    id: string;
    rating: number;
    comment: string | null;
    created_at: Date;
    user_id: string;
    name: string;
    avatar_url: string | null;
  }>(
    `select f.id, f.rating, f.comment, f.created_at, u.id as user_id, u.name, u.avatar_url
       from event_feedback f join users u on u.id = f.user_id
      where f.event_id = $1 order by f.created_at desc`,
    [eventId],
  );
  return rows.map((row) => ({
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    user: { id: row.user_id, name: row.name, avatarUrl: row.avatar_url, bio: null },
    createdAt: isoRequired(row.created_at),
  }));
}

/* ------------------------------------------------------------------ */
/* Dashboards & admin queues                                           */
/* ------------------------------------------------------------------ */

export interface EventCard {
  id: string;
  slug: string;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string;
  registeredCount: number;
  capacity: number | null;
  role: "organizer" | "attendee";
  registrationStatus: RegistrationStatus | null;
}

export async function myEvents(me: Me): Promise<{ organizing: EventCard[]; attending: EventCard[] }> {
  const rows = await many<{
    id: string;
    slug: string;
    title: string;
    status: string;
    starts_at: Date;
    ends_at: Date;
    capacity: number | null;
    registered_count: number;
    relation: "organizer" | "attendee";
    registration_status: RegistrationStatus | null;
  }>(
    `select e.id, e.slug, e.title, e.status, e.starts_at, e.ends_at, e.capacity,
            (select count(*)::int from event_registrations r
              where r.event_id = e.id and r.status in ('registered','attended')) as registered_count,
            'organizer'::text as relation, null::registration_status as registration_status
       from events e
      where e.created_by = $1
         or exists (select 1 from event_organizers eo where eo.event_id = e.id and eo.user_id = $1)
      union all
      select e.id, e.slug, e.title, e.status, e.starts_at, e.ends_at, e.capacity,
             (select count(*)::int from event_registrations r2
               where r2.event_id = e.id and r2.status in ('registered','attended')) as registered_count,
             'attendee'::text as relation, r.status as registration_status
        from event_registrations r join events e on e.id = r.event_id
       where r.user_id = $1 and r.status in ('registered','waitlisted','attended')
      order by starts_at asc`,
    [me.id],
  );
  const cards = rows.map<EventCard>((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    startsAt: isoRequired(row.starts_at),
    endsAt: isoRequired(row.ends_at),
    registeredCount: row.registered_count,
    capacity: row.capacity,
    role: row.relation,
    registrationStatus: row.registration_status,
  }));
  const seen = new Set<string>();
  const organizing = cards.filter((card) => {
    if (card.role !== "organizer" || seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
  return {
    organizing,
    attending: cards.filter((card) => card.role === "attendee"),
  };
}

export async function pendingEventProposals(): Promise<
  Array<EventSummary & { submittedAt: string | null; organizer: { id: string; name: string } }>
> {
  const rows = await many<EventRow & { submitted_at: Date | null; organizer_id: string; organizer_name: string }>(
    `select ${eventSelect}, e.submitted_at, u.id as organizer_id, u.name as organizer_name
       from events e
       join users u on u.id = e.created_by
       left join clubs c on c.id = e.club_id
      where e.status = 'submitted'
      order by e.submitted_at asc limit 100`,
  );
  return rows.map((row) => ({
    ...toSummary(row),
    submittedAt: iso(row.submitted_at),
    organizer: { id: row.organizer_id, name: row.organizer_name },
  }));
}

export async function eventStats(): Promise<{ confirmedAttendance: number; registrations: number }> {
  const row = await one<{ attendance: number; registrations: number }>(
    `select
       count(*) filter (where status = 'attended')::int as attendance,
       count(*) filter (where status in ('registered','attended'))::int as registrations
     from event_registrations`,
  );
  return { confirmedAttendance: row?.attendance ?? 0, registrations: row?.registrations ?? 0 };
}

export async function markNoShows(): Promise<number> {
  // Offline-safe: anyone still "registered" 24h after the event ended did not
  // attend. Runs from the durable maintenance job, never from a request path.
  const result = await query(
    `update event_registrations r
        set status = 'no_show'
       from events e
      where r.event_id = e.id and r.status = 'registered'
        and e.ends_at < now() - interval '24 hours'`,
  );
  return result.rowCount ?? 0;
}

export function assertValidWindow(startsAt: string, endsAt: string): void {
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw badRequest("The end time must be after the start time.");
}

/** Loads an event for its organizer tools, enforcing management rights. */
export async function getEventForManager(eventId: string, me: Me): Promise<EventDetail> {
  const row = await one<{ slug: string }>("select slug from events where id = $1", [eventId]);
  if (!row) throw notFound("Event not found");
  await requireEventManager(eventId, me);
  return getEventBySlug(row.slug, me);
}

/** Lightweight event header used by the attendee ticket page. */
export async function getTicketEvent(eventId: string, me: Me): Promise<{
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  venueName: string | null;
  registrationStatus: RegistrationStatus;
}> {
  const row = await one<{
    id: string;
    title: string;
    slug: string;
    starts_at: Date;
    ends_at: Date;
    timezone: string;
    venue_name: string | null;
    status: RegistrationStatus;
  }>(
    `select e.id, e.title, e.slug, e.starts_at, e.ends_at, e.timezone, e.venue_name, r.status
       from event_registrations r join events e on e.id = r.event_id
      where r.event_id = $1 and r.user_id = $2 and r.status in ('registered','attended')`,
    [eventId, me.id],
  );
  if (!row) throw notFound("You do not have a confirmed place at this event.");
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    startsAt: isoRequired(row.starts_at),
    endsAt: isoRequired(row.ends_at),
    timezone: row.timezone,
    venueName: row.venue_name,
    registrationStatus: row.status,
  };
}
