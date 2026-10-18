import type { AdminOverview, AdminUser, ClubSummary, GlobalRole, MaintenanceState } from "@campussphere/contracts";
import type { Me } from "../auth";
import { requireSuperAdmin } from "../auth";
import { iso, isoRequired, likePattern, many, one, query, stringArray, transaction } from "../db";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { writeAudit } from "../audit";
import { listAudit } from "../audit";
import { pendingProjectProposals } from "./projects";
import { pendingEventProposals } from "./events";
import { openReportCount } from "./moderation";
import { createClub } from "./clubs";
import { revokeAllSessions } from "../auth";

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

export async function adminOverview(me: Me): Promise<AdminOverview> {
  await requireSuperAdmin(me);
  const counts = await one<{
    pending_projects: number;
    pending_events: number;
    pending_club_applications: number;
    open_reports: number;
    users: number;
    clubs: number;
    projects: number;
    events: number;
    registrations: number;
  }>(
    `select
      (select count(*)::int from projects where status = 'submitted') as pending_projects,
      (select count(*)::int from events where status = 'submitted') as pending_events,
      (select count(*)::int from club_memberships where status = 'pending') as pending_club_applications,
      (select count(*)::int from moderation_reports where status in ('open','under_review')) as open_reports,
      (select count(*)::int from users where status <> 'deletion_requested') as users,
      (select count(*)::int from clubs where status = 'active') as clubs,
      (select count(*)::int from projects where status = 'approved') as projects,
      (select count(*)::int from events where status in ('published','completed')) as events,
      (select count(*)::int from event_registrations where status in ('registered','attended')) as registrations`,
  );
  return {
    pendingProjects: counts?.pending_projects ?? 0,
    pendingEvents: counts?.pending_events ?? 0,
    pendingClubApplications: counts?.pending_club_applications ?? 0,
    openReports: counts?.open_reports ?? 0,
    users: counts?.users ?? 0,
    clubs: counts?.clubs ?? 0,
    projects: counts?.projects ?? 0,
    events: counts?.events ?? 0,
    registrations: counts?.registrations ?? 0,
    recentAudit: await listAudit({ limit: 12 }),
  };
}

export async function reviewQueues(me: Me) {
  await requireSuperAdmin(me);
  const [projects, events, clubApplications] = await Promise.all([
    pendingProjectProposals(),
    pendingEventProposals(),
    many<{
      id: string;
      message: string | null;
      created_at: Date;
      club_id: string;
      club_name: string;
      club_slug: string;
      user_id: string;
      user_name: string;
      user_email: string;
    }>(
      `select m.id, m.message, m.created_at, c.id as club_id, c.name as club_name, c.slug as club_slug,
              u.id as user_id, u.name as user_name, u.email as user_email
         from club_memberships m
         join clubs c on c.id = m.club_id
         join users u on u.id = m.user_id
        where m.status = 'pending'
        order by m.created_at asc limit 100`,
    ),
  ]);
  return {
    projects,
    events,
    clubApplications: clubApplications.map((row) => ({
      id: row.id,
      message: row.message,
      createdAt: isoRequired(row.created_at),
      club: { id: row.club_id, name: row.club_name, slug: row.club_slug },
      user: { id: row.user_id, name: row.user_name, email: row.user_email },
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  roles: GlobalRole[];
  status: AdminUser["status"];
  created_at: Date;
  last_seen_at: Date | null;
}

export async function listUsers(me: Me, options: { q?: string; limit?: number; offset?: number } = {}): Promise<{
  items: AdminUser[];
  total: number;
}> {
  await requireSuperAdmin(me);
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const pattern = options.q ? likePattern(options.q) : null;
  const rows = await many<AdminUserRow>(
    `select id, name, email, avatar_url, roles, status, created_at, last_seen_at
       from users
      where ($1::text is null or name ilike $1 or email ilike $1)
      order by created_at desc
      limit $2 offset $3`,
    [pattern, limit, offset],
  );
  const total = await one<{ n: number }>(
    "select count(*)::int as n from users where ($1::text is null or name ilike $1 or email ilike $1)",
    [pattern],
  );
  return {
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatar_url,
      roles: stringArray(row.roles) as GlobalRole[],
      status: row.status,
      createdAt: isoRequired(row.created_at),
      lastSeenAt: iso(row.last_seen_at),
    })),
    total: total?.n ?? 0,
  };
}

export async function setUserRoles(me: Me, userId: string, roles: GlobalRole[]): Promise<void> {
  await requireSuperAdmin(me);
  const target = await one<{ id: string; roles: unknown; name: string }>(
    "select id, roles, name from users where id = $1",
    [userId],
  );
  if (!target) throw notFound("User not found");
  if (userId === me.id) throw conflict("You cannot change your own roles; ask another super-admin.");
  // `roles` is a Postgres enum array and arrives as `{student,super_admin}`,
  // not a JavaScript array; stringArray exists for exactly this reason.
  const beforeRoles = stringArray(target.roles);
  const unique = [...new Set(roles)];
  if (unique.length === 0) throw badRequest("Every user needs at least the student role.");
  if (unique.includes("super_admin")) {
    const admins = await one<{ n: number }>(
      "select count(*)::int as n from users where 'super_admin' = any(roles) and status = 'active'",
    );
    if ((admins?.n ?? 0) <= 1 && beforeRoles.includes("super_admin")) {
      throw conflict("Retain at least one super-admin.");
    }
  }
  await query("update users set roles = $2::global_role[] where id = $1", [userId, unique]);
  await writeAudit({
    actorId: me.id,
    action: unique.length > beforeRoles.length ? "user.role_granted" : "user.role_revoked",
    entityType: "user",
    entityId: userId,
    metadata: { before: beforeRoles, after: unique, targetName: target.name },
  });
  if (!unique.includes("super_admin") && beforeRoles.includes("super_admin")) {
    await revokeAllSessions(userId);
  }
}

/**
 * One-time bootstrap for the first super-admin. Deliberately not reachable from
 * the web app: it runs from `scripts/bootstrap-superadmin.mjs` with an explicit
 * confirmation variable. The audit row has a null actor because no signed-in
 * person exists yet, and repeated runs are safe (the role is de-duplicated).
 */
export async function bootstrapSuperAdmin(email: string): Promise<{ id: string; created: boolean }> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw badRequest("Enter a valid email address.");
  return transaction(async (client) => {
    const existing = await client.query<{ id: string; roles: unknown }>(
      "select id, roles from users where lower(email) = $1",
      [normalized],
    );
    let id: string;
    let created = false;
    if (existing.rows[0]) {
      const roles = Array.from(new Set([...stringArray(existing.rows[0].roles), "super_admin"]));
      await client.query("update users set roles = $2::global_role[] where id = $1", [existing.rows[0].id, roles]);
      id = existing.rows[0].id;
    } else {
      const inserted = await client.query<{ id: string }>(
        `insert into users (email, email_verified, name, roles)
         values ($1, true, $2, '{student,super_admin}'::global_role[])
         returning id`,
        [normalized, normalized.split("@")[0]],
      );
      id = inserted.rows[0]!.id;
      created = true;
    }
    await writeAudit(
      {
        actorId: null,
        action: "admin.bootstrap_superadmin",
        entityType: "user",
        entityId: id,
        metadata: { email: normalized, via: "bootstrapSuperAdmin", created },
      },
      client,
    );
    return { id, created };
  });
}

export async function setSuspension(me: Me, userId: string, suspended: boolean, reason: string): Promise<void> {
  await requireSuperAdmin(me);
  if (userId === me.id) throw conflict("You cannot suspend your own account.");
  const target = await one<{ id: string; status: string }>("select id, status from users where id = $1", [userId]);
  if (!target) throw notFound("User not found");
  if (target.status === "deletion_requested") throw conflict("This account is already being deleted.");
  await query("update users set status = $2 where id = $1", [userId, suspended ? "suspended" : "active"]);
  if (suspended) await revokeAllSessions(userId);
  await writeAudit({
    actorId: me.id,
    action: suspended ? "user.suspended" : "user.reactivated",
    entityType: "user",
    entityId: userId,
    metadata: { reason },
  });
}

/* ------------------------------------------------------------------ */
/* Clubs                                                               */
/* ------------------------------------------------------------------ */

export async function adminListClubs(me: Me): Promise<ClubSummary[]> {
  await requireSuperAdmin(me);
  const rows = await many<{
    id: string;
    slug: string;
    name: string;
    tagline: string | null;
    category: ClubSummary["category"];
    logo_url: string | null;
    verified: boolean;
    membership_policy: ClubSummary["membershipPolicy"];
    member_count: number;
    upcoming_event_count: number;
  }>(
    `select c.id, c.slug, c.name, c.tagline, c.category, c.logo_url, c.verified, c.membership_policy,
            (select count(*)::int from club_memberships m where m.club_id = c.id and m.status = 'active') as member_count,
            (select count(*)::int from events e where e.club_id = c.id and e.status = 'published' and e.starts_at > now()) as upcoming_event_count
       from clubs c where c.status = 'active' order by c.name`,
  );
  return rows.map((row) => ({
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
  }));
}

export async function adminCreateClub(me: Me, input: Parameters<typeof createClub>[1]) {
  await requireSuperAdmin(me);
  return createClub(me, input);
}

export async function setClubVerification(me: Me, clubId: string, verified: boolean): Promise<void> {
  await requireSuperAdmin(me);
  const result = await query("update clubs set verified = $2 where id = $1", [clubId, verified]);
  if (result.rowCount === 0) throw notFound("Club not found");
  await writeAudit({
    actorId: me.id,
    action: "club.updated",
    entityType: "club",
    entityId: clubId,
    metadata: { verified },
  });
}

/* ------------------------------------------------------------------ */
/* Settings & maintenance                                              */
/* ------------------------------------------------------------------ */

export async function getMaintenanceState(): Promise<MaintenanceState> {
  const row = await one<{ value: { enabled?: boolean; message?: string | null }; updated_at: Date | null }>(
    "select value, updated_at from settings where key = 'maintenance'",
  );
  return {
    enabled: row?.value?.enabled === true,
    message: row?.value?.message ?? null,
    updatedAt: iso(row?.updated_at ?? null),
    updatedBy: null,
  };
}

export async function setMaintenanceState(
  me: Me,
  input: { enabled: boolean; message?: string | null },
): Promise<void> {
  await requireSuperAdmin(me);
  await transaction(async (client) => {
    await client.query(
      `insert into settings (key, value, updated_at, updated_by)
       values ('maintenance', $1, now(), $2)
       on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
      [JSON.stringify({ enabled: input.enabled, message: input.message ?? null }), me.id],
    );
    await writeAudit(
      {
        actorId: me.id,
        action: "admin.maintenance_changed",
        entityType: "settings",
        entityId: "maintenance",
        metadata: { enabled: input.enabled, message: input.message ?? null },
      },
      client,
    );
  });
}

export async function isMaintenanceEnabled(): Promise<boolean> {
  const state = await getMaintenanceState();
  return state.enabled;
}

export async function requireWritesEnabled(): Promise<void> {
  if (await isMaintenanceEnabled()) {
    throw new (await import("../errors")).AppError(
      "unavailable",
      "CampusSphere is in maintenance mode. Reads remain available; changes are paused.",
      503,
    );
  }
}

export function assertNotSelf(me: Me, userId: string): void {
  if (me.id === userId) throw forbidden("You cannot perform this action on your own account.");
}

export { openReportCount };
