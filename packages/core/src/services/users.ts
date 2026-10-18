import type { Me } from "../auth";
import { iso, isoRequired, many, one, query, transaction } from "../db";
import { writeAudit } from "../audit";
import { revokeAllSessions } from "../auth";
import { badRequest, notFound } from "../errors";

export async function updateProfile(me: Me, input: { name: string; bio?: string | null }): Promise<void> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw badRequest("A display name needs 2–120 characters.");
  const bio = input.bio?.trim() ?? null;
  if (bio && bio.length > 2000) throw badRequest("A bio can be at most 2000 characters.");
  await query("update users set name = $2, bio = $3 where id = $1", [me.id, name, bio]);
  await writeAudit({
    actorId: me.id,
    action: "user.profile_updated",
    entityType: "user",
    entityId: me.id,
    metadata: { fields: ["name", "bio"] },
  });
}

export interface PublicProfile {
  id: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  memberSince: string;
  clubs: Array<{ slug: string; name: string; role: string }>;
  ledProjects: Array<{ slug: string; title: string }>;
}

export async function getPublicProfile(userId: string): Promise<PublicProfile> {
  const user = await one<{ id: string; name: string; avatar_url: string | null; bio: string | null; created_at: Date }>(
    "select id, name, avatar_url, bio, created_at from users where id = $1 and status = 'active'",
    [userId],
  );
  if (!user) throw notFound("This profile does not exist.");
  const [clubs, ledProjects] = await Promise.all([
    many<{ slug: string; name: string; role: string }>(
      `select c.slug, c.name, m.role from club_memberships m join clubs c on c.id = m.club_id
        where m.user_id = $1 and m.status = 'active' and c.status = 'active'
        order by c.name`,
      [userId],
    ),
    many<{ slug: string; title: string }>(
      `select slug, title from projects
        where lead_id = $1 and status = 'approved' and visibility = 'public' order by approved_at desc limit 12`,
      [userId],
    ),
  ]);
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatar_url,
    bio: user.bio,
    memberSince: isoRequired(user.created_at),
    clubs,
    ledProjects,
  };
}

/**
 * Returns everything a person contributed. Retained audit records are excluded
 * here because they may reference other people's data; they are available to
 * the account owner through the admin export workflow on request.
 */
export async function exportMyData(me: Me): Promise<Record<string, unknown>> {
  const [user, memberships, projectMembers, applications, registrations, notifications, reports] =
    await Promise.all([
      one("select id, email, name, bio, avatar_url, roles::text[] as roles, status, created_at from users where id = $1", [me.id]),
      many("select club_id, role, status, created_at, decided_at from club_memberships where user_id = $1", [me.id]),
      many("select project_id, role, joined_at from project_members where user_id = $1", [me.id]),
      many("select project_id, role_id, message, status, created_at from project_applications where user_id = $1", [
        me.id,
      ]),
      many("select event_id, status, position, created_at from event_registrations where user_id = $1", [me.id]),
      many("select kind, title, body, created_at from notifications where user_id = $1 order by created_at desc limit 500", [
        me.id,
      ]),
      many("select target_type, reason, status, created_at from moderation_reports where reporter_id = $1", [me.id]),
    ]);
  await writeAudit({ actorId: me.id, action: "user.data_exported", entityType: "user", entityId: me.id });
  return {
    exportedAt: new Date().toISOString(),
    account: user,
    clubMemberships: memberships,
    projectMemberships: projectMembers,
    projectApplications: applications,
    eventRegistrations: registrations,
    notifications,
    reportsYouFiled: reports,
    note:
      "This export contains the data tied to your account. Content you posted in clubs and projects " +
      "remains attributed to you unless you request account deletion.",
  };
}

/**
 * Anonymises the account and revokes every session. Content is retained but no
 * longer linked to an identifiable person. This keeps club history coherent
 * while honouring a deletion request; it is documented in docs/PRIVACY.md.
 */
export async function requestDeletion(me: Me): Promise<{ retained: string[] }> {
  await transaction(async (client) => {
    await client.query(
      `update users
          set status = 'deletion_requested',
              name = 'Former member',
              email = 'deleted-' || id::text || '@invalid.campussphere',
              google_sub = null,
              avatar_url = null,
              bio = null
        where id = $1`,
      [me.id],
    );
    await client.query("update sessions set revoked_at = now() where user_id = $1", [me.id]);
    await client.query(
      `insert into audit_events (actor_id, action, entity_type, entity_id, metadata)
       values ($1::uuid, 'user.deletion_requested', 'user', $1::text, '{}'::jsonb)`,
      [me.id],
    );
  });
  await revokeAllSessions(me.id);
  return {
    retained: [
      "Your posts, applications and registrations are kept but no longer show your name.",
      "Audit records of administrative actions are retained for accountability.",
    ],
  };
}

export async function accountSummary(userId: string) {
  const row = await one<{
    clubs: number;
    projects: number;
    events: number;
    pending_applications: number;
  }>(
    `select
       (select count(*)::int from club_memberships where user_id = $1 and status = 'active') as clubs,
       (select count(*)::int from project_members where user_id = $1) as projects,
       (select count(*)::int from event_registrations where user_id = $1 and status in ('registered','attended')) as events,
       (select count(*)::int from project_applications where user_id = $1 and status = 'pending') as pending_applications`,
    [userId],
  );
  return {
    clubs: row?.clubs ?? 0,
    projects: row?.projects ?? 0,
    events: row?.events ?? 0,
    pendingApplications: row?.pending_applications ?? 0,
  };
}

export async function avatarFor(userId: string) {
  const row = await one<{ avatar_url: string | null; name: string; created_at: Date }>(
    "select avatar_url, name, created_at from users where id = $1",
    [userId],
  );
  return row ? { avatarUrl: row.avatar_url, name: row.name, createdAt: iso(row.created_at) } : null;
}
