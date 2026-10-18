import type {
  Announcement,
  ClubApplication,
  ClubDetail,
  ClubMember,
  ClubMembershipPolicy,
  ClubRole,
  ClubSummary,
  Paginated,
} from "@campussphere/contracts";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { decodeCursor, encodeCursor, iso, isoRequired, likePattern, many, one, pageLimit, query, transaction, uniqueSlug } from "../db";
import { isSuperAdmin, type Me } from "../auth";
import { writeAudit } from "../audit";
import { notify } from "../notifications";

interface ClubRow {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string;
  category: ClubSummary["category"];
  logo_url: string | null;
  cover_url: string | null;
  website_url: string | null;
  contact_email: string | null;
  instagram_url: string | null;
  membership_policy: ClubMembershipPolicy;
  verified: boolean;
  created_at: Date;
  member_count: number;
  upcoming_event_count: number;
}

const summaryColumns = `
  c.id, c.slug, c.name, c.tagline, c.category, c.logo_url, c.verified, c.membership_policy,
  c.created_at,
  (select count(*)::int from club_memberships m where m.club_id = c.id and m.status = 'active') as member_count,
  (select count(*)::int from events e
    where e.club_id = c.id and e.status = 'published' and e.starts_at > now()) as upcoming_event_count
`;

function toSummary(row: ClubRow): ClubSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    category: row.category,
    logoUrl: row.logo_url,
    verified: row.verified,
    membershipPolicy: row.membership_policy,
    memberCount: row.member_count,
    upcomingEventCount: row.upcoming_event_count,
  };
}

export async function listClubs(options: {
  category?: string;
  q?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<Paginated<ClubSummary>> {
  const limit = pageLimit(options.limit);
  const cursor = decodeCursor(options.cursor);
  const values: unknown[] = [limit + 1];
  const where: string[] = ["c.status = 'active'"];
  if (options.category) {
    values.push(options.category);
    where.push(`c.category = $${values.length}`);
  }
  if (options.q) {
    values.push(likePattern(options.q));
    where.push(`(c.name ilike $${values.length} or c.tagline ilike $${values.length} or c.description ilike $${values.length})`);
  }
  if (cursor) {
    values.push(cursor.at, cursor.id);
    where.push(`(c.created_at, c.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
  }
  const rows = await many<ClubRow>(
    `select ${summaryColumns}, c.description
       from clubs c
      where ${where.join(" and ")}
      order by c.created_at desc, c.id desc
      limit $1`,
    values,
  );
  const items = rows.slice(0, limit).map(toSummary);
  const last = rows.length > limit ? rows[limit - 1] : null;
  return { items, nextCursor: last ? encodeCursor(last.created_at, last.id) : null };
}

export async function getClubBySlug(slug: string, viewer: Me | null): Promise<ClubDetail> {
  const row = await one<ClubRow & { description: string }>(
    `select ${summaryColumns}, c.description, c.cover_url, c.website_url, c.contact_email,
            c.instagram_url, c.created_at
       from clubs c where c.slug = $1 and c.status = 'active'`,
    [slug],
  );
  if (!row) throw notFound("This club does not exist.");

  const [membership, officers, announcements, upcoming, past, projects] = await Promise.all([
    viewer
      ? one<{ status: ClubDetail["membership"] extends infer _ ? string : string; role: ClubRole | null }>(
          "select status, role from club_memberships where club_id = $1 and user_id = $2 and status in ('active','pending','rejected')",
          [row.id, viewer.id],
        )
      : Promise.resolve(null),
    many<{ user_id: string; name: string; avatar_url: string | null; role: ClubRole; joined_at: Date }>(
      `select m.user_id, u.name, u.avatar_url, m.role, m.created_at as joined_at
         from club_memberships m join users u on u.id = m.user_id
        where m.club_id = $1 and m.status = 'active' and m.role in ('officer','president')
        order by m.role desc, m.created_at asc`,
      [row.id],
    ),
    many<{ id: string; title: string; body: string; pinned: boolean; published_at: Date; author_id: string; author_name: string; author_avatar: string | null }>(
      `select a.id, a.title, a.body, a.pinned, a.published_at,
              u.id as author_id, u.name as author_name, u.avatar_url as author_avatar
         from announcements a join users u on u.id = a.author_id
        where a.club_id = $1 order by a.pinned desc, a.published_at desc limit 10`,
      [row.id],
    ),
    many<Record<string, unknown>>(
      `select e.id, e.slug, e.title, e.summary, e.category, e.status, e.starts_at, e.ends_at,
              e.timezone, e.venue_name, e.online_url, e.capacity, e.cover_url,
              (select count(*)::int from event_registrations r where r.event_id = e.id and r.status in ('registered','attended')) as registered_count,
              (select count(*)::int from event_registrations r where r.event_id = e.id and r.status = 'waitlisted') as waitlist_count
         from events e
        where e.club_id = $1 and e.status = 'published' and e.starts_at > now()
        order by e.starts_at asc limit 6`,
      [row.id],
    ),
    many<Record<string, unknown>>(
      `select e.id, e.slug, e.title, e.summary, e.category, e.status, e.starts_at, e.ends_at,
              e.timezone, e.venue_name, e.online_url, e.capacity, e.cover_url,
              (select count(*)::int from event_registrations r where r.event_id = e.id and r.status in ('registered','attended')) as registered_count,
              (select count(*)::int from event_registrations r where r.event_id = e.id and r.status = 'waitlisted') as waitlist_count
         from events e
        where e.club_id = $1 and e.status in ('published','completed') and e.starts_at <= now()
        order by e.starts_at desc limit 6`,
      [row.id],
    ),
    many<Record<string, unknown>>(
      `select p.id, p.slug, p.title, p.summary, p.category, p.status, p.cover_url, p.created_at, p.approved_at,
              u.id as lead_id, u.name as lead_name, u.avatar_url as lead_avatar,
              (select count(*)::int from project_members pm where pm.project_id = p.id) as member_count,
              (select count(*)::int from project_applications pa where pa.project_id = p.id and pa.status = 'pending') as open_roles
         from projects p join users u on u.id = p.lead_id
        where p.club_id = $1 and p.status = 'approved' and p.visibility = 'public'
        order by p.approved_at desc limit 6`,
      [row.id],
    ),
  ]);

  const eventSummary = (event: Record<string, unknown>) => ({
    id: String(event.id),
    slug: String(event.slug),
    title: String(event.title),
    summary: String(event.summary),
    category: event.category as never,
    status: event.status as never,
    startsAt: isoRequired(event.starts_at as Date),
    endsAt: isoRequired(event.ends_at as Date),
    timezone: String(event.timezone),
    venueName: (event.venue_name as string | null) ?? null,
    isOnline: Boolean(event.online_url) && !event.venue_name,
    capacity: (event.capacity as number | null) ?? null,
    registeredCount: Number(event.registered_count ?? 0),
    waitlistCount: Number(event.waitlist_count ?? 0),
    coverUrl: (event.cover_url as string | null) ?? null,
    club: { id: row.id, slug: row.slug, name: row.name },
  });

  return {
    ...toSummary(row),
    description: row.description,
    coverUrl: row.cover_url,
    websiteUrl: row.website_url,
    contactEmail: row.contact_email,
    instagramUrl: row.instagram_url,
    createdAt: isoRequired(row.created_at),
    membership: membership
      ? { status: membership.status as ClubDetail["membership"] extends infer _ ? never : never, role: membership.role }
      : null,
    officers: officers.map((officer) => ({
      userId: officer.user_id,
      name: officer.name,
      avatarUrl: officer.avatar_url,
      role: officer.role,
      joinedAt: isoRequired(officer.joined_at),
    })),
    announcements: announcements.map<Announcement>((announcement) => ({
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      pinned: announcement.pinned,
      publishedAt: isoRequired(announcement.published_at),
      author: {
        id: announcement.author_id,
        name: announcement.author_name,
        avatarUrl: announcement.author_avatar,
        bio: null,
      },
    })),
    upcomingEvents: upcoming.map(eventSummary),
    pastEvents: past.map(eventSummary),
    projects: projects.map((project) => ({
      id: String(project.id),
      slug: String(project.slug),
      title: String(project.title),
      summary: String(project.summary),
      category: project.category as never,
      status: project.status as never,
      coverUrl: (project.cover_url as string | null) ?? null,
      club: { id: row.id, slug: row.slug, name: row.name },
      lead: {
        id: String(project.lead_id),
        name: String(project.lead_name),
        avatarUrl: (project.lead_avatar as string | null) ?? null,
        bio: null,
      },
      memberCount: Number(project.member_count ?? 0),
      openRoles: Number(project.open_roles ?? 0),
      createdAt: isoRequired(project.created_at as Date),
      approvedAt: iso(project.approved_at as Date | null),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Authorization helpers                                               */
/* ------------------------------------------------------------------ */

export type ClubPermission = "content" | "manage_members" | "manage_roles";

interface ClubAccessRow {
  club_id: string;
  role: ClubRole;
  status: string;
}

export async function clubRoleFor(clubId: string, userId: string | null | undefined): Promise<ClubRole | null> {
  if (!userId) return null;
  const row = await one<ClubAccessRow>(
    `select club_id, role, status from club_memberships
      where club_id = $1 and user_id = $2 and status = 'active'`,
    [clubId, userId],
  );
  return row?.role ?? null;
}

export async function requireClubAccess(
  clubId: string,
  me: Me | null,
  permission: ClubPermission,
): Promise<{ clubRole: ClubRole | null; isAdmin: boolean }> {
  const isAdmin = isSuperAdmin(me);
  const clubRole = await clubRoleFor(clubId, me?.id);
  if (isAdmin) return { clubRole, isAdmin };
  if (!clubRole) throw forbidden("Only this club's officers can do that.");
  if (permission === "content" && (clubRole === "officer" || clubRole === "president")) {
    return { clubRole, isAdmin };
  }
  if (permission === "manage_members" && (clubRole === "officer" || clubRole === "president")) {
    return { clubRole, isAdmin };
  }
  if (permission === "manage_roles" && clubRole === "president") {
    return { clubRole, isAdmin };
  }
  throw forbidden("Your club role does not allow that action.");
}

export async function isClubOfficer(clubId: string, userId: string | null | undefined): Promise<boolean> {
  const role = await clubRoleFor(clubId, userId);
  return role === "officer" || role === "president";
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export async function createClub(
  me: Me,
  input: {
    name: string;
    tagline?: string | null;
    description: string;
    category: ClubSummary["category"];
    logoUrl?: string | null;
    coverUrl?: string | null;
    websiteUrl?: string | null;
    contactEmail?: string | null;
    instagramUrl?: string | null;
    membershipPolicy?: ClubMembershipPolicy;
  },
): Promise<{ id: string; slug: string }> {
  if (!isSuperAdmin(me)) throw forbidden("Only a super-admin can create clubs.");
  const slug = await uniqueSlug("clubs", input.name);
  return transaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `insert into clubs (slug, name, tagline, description, category, logo_url, cover_url,
                          website_url, contact_email, instagram_url, membership_policy, verified, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12) returning id`,
      [
        slug,
        input.name,
        input.tagline ?? null,
        input.description,
        input.category,
        input.logoUrl ?? null,
        input.coverUrl ?? null,
        input.websiteUrl ?? null,
        input.contactEmail || null,
        input.instagramUrl ?? null,
        input.membershipPolicy ?? "request",
        me.id,
      ],
    );
    const clubId = inserted.rows[0]!.id;
    await client.query(
      `insert into club_memberships (club_id, user_id, role, status, decided_at, decided_by)
       values ($1, $2, 'president', 'active', now(), $2)`,
      [clubId, me.id],
    );
    await writeAudit(
      { actorId: me.id, action: "club.created", entityType: "club", entityId: clubId, metadata: { name: input.name } },
      client,
    );
    return { id: clubId, slug };
  });
}

export async function updateClub(clubId: string, me: Me, patch: Record<string, unknown>): Promise<void> {
  const row = await one<{ slug: string }>("select slug from clubs where id = $1", [clubId]);
  if (!row) throw notFound("Club not found");
  await requireClubAccess(clubId, me, "content");

  const columns: Record<string, string> = {
    name: "name",
    tagline: "tagline",
    description: "description",
    category: "category",
    logoUrl: "logo_url",
    coverUrl: "cover_url",
    websiteUrl: "website_url",
    contactEmail: "contact_email",
    instagramUrl: "instagram_url",
    membershipPolicy: "membership_policy",
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(columns)) {
    if (key in patch) {
      values.push(patch[key] === "" ? null : patch[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (sets.length === 0) throw badRequest("Nothing to update");
  values.push(clubId);
  await query(`update clubs set ${sets.join(", ")} where id = $${values.length}`, values);
  await writeAudit({
    actorId: me.id,
    action: "club.updated",
    entityType: "club",
    entityId: clubId,
    metadata: { fields: Object.keys(patch) },
  });
}

/* ------------------------------------------------------------------ */
/* Membership                                                          */
/* ------------------------------------------------------------------ */

export async function joinClub(clubId: string, me: Me, message?: string | null): Promise<{ status: string }> {
  const club = await one<{ id: string; membership_policy: ClubMembershipPolicy; name: string; slug: string }>(
    "select id, membership_policy, name, slug from clubs where id = $1 and status = 'active'",
    [clubId],
  );
  if (!club) throw notFound("Club not found");
  const existing = await one<{ status: string }>(
    "select status from club_memberships where club_id = $1 and user_id = $2 and status in ('active','pending')",
    [clubId, me.id],
  );
  if (existing) throw conflict(existing.status === "active" ? "You are already a member." : "Your request is already pending.");
  if (club.membership_policy === "invite") {
    throw forbidden("This club is invite-only. Ask an officer for an invitation.");
  }

  const status = club.membership_policy === "open" ? "active" : "pending";
  const decidedAt = status === "active" ? new Date() : null;
  await query(
    `insert into club_memberships (club_id, user_id, role, status, message, decided_at)
     values ($1, $2, 'member', $3, $4, $5)`,
    [clubId, me.id, status, message ?? null, decidedAt],
  );
  await writeAudit({
    actorId: me.id,
    action: "club.membership_requested",
    entityType: "club",
    entityId: clubId,
    metadata: { status },
  });

  if (status === "pending") {
    const officers = await many<{ user_id: string }>(
      "select user_id from club_memberships where club_id = $1 and status = 'active' and role in ('officer','president')",
      [clubId],
    );
    await Promise.all(
      officers.map((officer) =>
        notify({
          userId: officer.user_id,
          kind: "club_application_received",
          title: `New member request for ${club.name}`,
          body: `${me.name} asked to join ${club.name}.`,
          link: `/clubs/${club.slug}/manage`,
        }),
      ),
    );
  }
  return { status };
}

export async function leaveClub(clubId: string, me: Me): Promise<void> {
  const membership = await one<{ id: string; role: ClubRole }>(
    "select id, role from club_memberships where club_id = $1 and user_id = $2 and status = 'active'",
    [clubId, me.id],
  );
  if (!membership) throw notFound("You are not a member of this club.");
  if (membership.role === "president") {
    const otherPresidents = await one<{ n: number }>(
      `select count(*)::int as n from club_memberships
        where club_id = $1 and status = 'active' and role = 'president' and user_id <> $2`,
      [clubId, me.id],
    );
    if ((otherPresidents?.n ?? 0) === 0) {
      throw conflict("Hand over the presidency before leaving so the club is never leaderless.");
    }
  }
  await query("update club_memberships set status = 'left', updated_at = now() where id = $1", [membership.id]);
  await writeAudit({
    actorId: me.id,
    action: "club.membership_left",
    entityType: "club",
    entityId: clubId,
    metadata: { role: membership.role },
  });
}

export async function listClubApplications(clubId: string, me: Me): Promise<ClubApplication[]> {
  await requireClubAccess(clubId, me, "manage_members");
  const rows = await many<{
    id: string;
    status: string;
    message: string | null;
    created_at: Date;
    user_id: string;
    name: string;
    avatar_url: string | null;
  }>(
    `select m.id, m.status, m.message, m.created_at, u.id as user_id, u.name, u.avatar_url
       from club_memberships m join users u on u.id = m.user_id
      where m.club_id = $1 and m.status = 'pending'
      order by m.created_at asc`,
    [clubId],
  );
  return rows.map((row) => ({
    id: row.id,
    user: { id: row.user_id, name: row.name, avatarUrl: row.avatar_url, bio: null },
    status: row.status as ClubApplication["status"],
    message: row.message,
    createdAt: isoRequired(row.created_at),
  }));
}

export async function decideMembership(
  clubId: string,
  membershipId: string,
  me: Me,
  decision: { status: "active" | "rejected"; role?: ClubRole },
): Promise<void> {
  const { clubRole, isAdmin } = await requireClubAccess(clubId, me, "manage_members");
  if (decision.role && decision.role !== "member" && clubRole !== "president" && !isAdmin) {
    throw forbidden("Only the president can grant officer roles.");
  }
  const membership = await one<{
    id: string;
    user_id: string;
    status: string;
    club_name: string;
    club_slug: string;
  }>(
    `select m.id, m.user_id, m.status, c.name as club_name, c.slug as club_slug
       from club_memberships m join clubs c on c.id = m.club_id
      where m.id = $1 and m.club_id = $2`,
    [membershipId, clubId],
  );
  if (!membership) throw notFound("Application not found");
  if (membership.status !== "pending" && !isAdmin) throw conflict("This application was already decided.");

  await query(
    `update club_memberships
        set status = $2, role = coalesce($3, role), decided_by = $4, decided_at = now(), updated_at = now()
      where id = $1`,
    [membership.id, decision.status, decision.role ?? null, me.id],
  );
  await writeAudit({
    actorId: me.id,
    action: decision.status === "active" ? "club.membership_approved" : "club.membership_rejected",
    entityType: "club",
    entityId: clubId,
    metadata: { membershipId, userId: membership.user_id },
  });
  await notify({
    userId: membership.user_id,
    kind: "club_application_decided",
    title:
      decision.status === "active"
        ? `Welcome to ${membership.club_name}`
        : `Your ${membership.club_name} request was declined`,
    body:
      decision.status === "active"
        ? `Your membership in ${membership.club_name} is now active.`
        : `An officer of ${membership.club_name} declined your membership request.`,
    link: `/clubs/${membership.club_slug}`,
  });
}

export async function changeMemberRole(
  clubId: string,
  targetUserId: string,
  me: Me,
  role: ClubRole,
): Promise<void> {
  const { isAdmin } = await requireClubAccess(clubId, me, "manage_roles");
  const target = await one<{ id: string; role: ClubRole }>(
    "select id, role from club_memberships where club_id = $1 and user_id = $2 and status = 'active'",
    [clubId, targetUserId],
  );
  if (!target) throw notFound("That person is not an active member.");
  if (target.role === "president" && role !== "president" && !isAdmin) {
    const others = await one<{ n: number }>(
      "select count(*)::int as n from club_memberships where club_id = $1 and role = 'president' and status = 'active' and user_id <> $2",
      [clubId, targetUserId],
    );
    if ((others?.n ?? 0) === 0) throw conflict("A club needs at least one president.");
  }

  await transaction(async (client) => {
    if (role === "president") {
      // Presidency is a handover, not a second crown.
      await client.query(
        `update club_memberships set role = 'officer'
          where club_id = $1 and status = 'active' and role = 'president' and user_id <> $2`,
        [clubId, targetUserId],
      );
    }
    await client.query("update club_memberships set role = $2 where id = $1", [target.id, role]);
    await writeAudit(
      {
        actorId: me.id,
        action: "club.member_role_changed",
        entityType: "club",
        entityId: clubId,
        metadata: { targetUserId, role },
      },
      client,
    );
  });
  await notify({
    userId: targetUserId,
    kind: "system",
    title: "Your club role changed",
    body: `Your role is now ${role}.`,
    link: null,
  });
}

export async function listClubMembers(clubId: string): Promise<ClubMember[]> {
  const rows = await many<{ user_id: string; name: string; avatar_url: string | null; role: ClubRole; joined_at: Date }>(
    `select m.user_id, u.name, u.avatar_url, m.role, m.created_at as joined_at
       from club_memberships m join users u on u.id = m.user_id
      where m.club_id = $1 and m.status = 'active'
      order by m.role desc, m.created_at asc`,
    [clubId],
  );
  return rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    avatarUrl: row.avatar_url,
    role: row.role,
    joinedAt: isoRequired(row.joined_at),
  }));
}

export async function createAnnouncement(
  clubId: string,
  me: Me,
  input: { title: string; body: string; pinned?: boolean },
): Promise<{ id: string }> {
  const access = await one<{ slug: string; name: string }>("select slug, name from clubs where id = $1", [clubId]);
  if (!access) throw notFound("Club not found");
  await requireClubAccess(clubId, me, "content");
  const inserted = await one<{ id: string }>(
    `insert into announcements (club_id, author_id, title, body, pinned)
     values ($1,$2,$3,$4,$5) returning id`,
    [clubId, me.id, input.title, input.body, input.pinned ?? false],
  );
  await writeAudit({
    actorId: me.id,
    action: "club.announcement_published",
    entityType: "club",
    entityId: clubId,
    metadata: { announcementId: inserted!.id },
  });
  const members = await many<{ user_id: string }>(
    "select user_id from club_memberships where club_id = $1 and status = 'active' and user_id <> $2",
    [clubId, me.id],
  );
  await Promise.all(
    members.map((member) =>
      notify({
        userId: member.user_id,
        kind: "announcement",
        title: `${access.name}: ${input.title}`,
        body: input.body.slice(0, 240),
        link: `/clubs/${access.slug}#announcements`,
      }),
    ),
  );
  return { id: inserted!.id };
}

export async function clubsWaitingForReview(): Promise<number> {
  const row = await one<{ n: number }>("select count(*)::int as n from club_memberships where status = 'pending'");
  return row?.n ?? 0;
}

/** Clubs where the viewer can act as an officer or president (for forms). */
export async function clubsWhereOfficer(userId: string): Promise<Array<{ id: string; name: string; slug: string; role: ClubRole }>> {
  return many<{ id: string; name: string; slug: string; role: ClubRole }>(
    `select c.id, c.name, c.slug, m.role
       from club_memberships m join clubs c on c.id = m.club_id
      where m.user_id = $1 and m.status = 'active' and m.role in ('officer','president')
        and c.status = 'active'
      order by c.name`,
    [userId],
  );
}
