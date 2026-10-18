import type { Me } from "../auth";
import { iso, isoRequired, many, one, query, stringArray, transaction } from "../db";
import { writeAudit } from "../audit";
import { revokeAllSessions } from "../auth";
import { deleteObject } from "../storage";
import { badRequest, conflict, notFound } from "../errors";

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
  const [
    user,
    memberships,
    projectMembers,
    applications,
    registrations,
    notifications,
    reports,
    feedback,
    announcements,
    projectUpdates,
    tasks,
    media,
    sessions,
    audit,
  ] = await Promise.all([
    one("select id, email, name, bio, avatar_url, roles::text[] as roles, status, created_at from users where id = $1", [me.id]),
    many("select club_id, role, status, created_at, decided_at from club_memberships where user_id = $1", [me.id]),
    many("select project_id, role, joined_at from project_members where user_id = $1", [me.id]),
    many("select project_id, role_id, message, status, created_at from project_applications where user_id = $1", [me.id]),
    many("select event_id, status, position, created_at from event_registrations where user_id = $1", [me.id]),
    many("select kind, title, body, created_at from notifications where user_id = $1 order by created_at desc limit 500", [me.id]),
    many("select target_type, reason, status, created_at from moderation_reports where reporter_id = $1", [me.id]),
    many("select event_id, rating, comment, created_at from event_feedback where user_id = $1", [me.id]),
    many("select club_id, title, body, published_at from announcements where author_id = $1", [me.id]),
    many("select project_id, title, body, created_at from project_updates where author_id = $1", [me.id]),
    many("select project_id, title, description, status, due_date from project_tasks where assignee_id = $1", [me.id]),
    many("select id, kind, scope_id, content_type, byte_size, status, created_at from media_assets where owner_id = $1", [me.id]),
    // Session metadata, but never the token hash: exporting it would hand out
    // the material needed to *use* a session, not just to describe one.
    many("select created_at, expires_at, revoked_at, user_agent, ip_hash from sessions where user_id = $1", [me.id]),
    many("select action, entity_type, entity_id, metadata, created_at from audit_events where actor_id = $1 order by id desc limit 1000", [me.id]),
  ]);
  await writeAudit({ actorId: me.id, action: "user.data_exported", entityType: "user", entityId: me.id });
  return {
    exportedAt: new Date().toISOString(),
    account: user,
    clubMemberships: memberships,
    projectMemberships: projectMembers,
    projectApplications: applications,
    eventRegistrations: registrations,
    eventFeedback: feedback,
    announcements: announcements,
    projectUpdates: projectUpdates,
    assignedTasks: tasks,
    uploadedMedia: media,
    sessions: sessions,
    auditTrail: audit,
    notifications,
    reportsYouFiled: reports,
    note:
      "This export contains the data tied to your account, including content you authored and the " +
      "session metadata we keep. Content you posted in clubs and projects remains attributed to you " +
      "unless you request account deletion.",
  };
}

/**
 * Anonymises the account and revokes every session.
 *
 * "Delete my account" cannot mean "delete every row that mentions me" without
 * destroying club history, event attendance and the audit trail. What it *can*
 * mean — and now does — is that no row identifies the person: the profile is
 * overwritten, leadership is not left dangling, memberships end, queued mail is
 * dropped, and delivery records for their address are redacted.
 *
 * Two things are deliberately refused rather than silently half-done: being the
 * last active super-admin, and being the only person able to run a club, project
 * or upcoming event. In both cases the message says what to hand over first.
 */
export async function requestDeletion(me: Me): Promise<{ retained: string[] }> {
  const avatarAssets = await many<{ id: string; object_key: string }>(
    "select id, object_key from media_assets where kind = 'avatar' and owner_id = $1 and status = 'ready'",
    [me.id],
  );

  await transaction(async (client) => {
    const self = await client.query<{ email: string; name: string; roles: unknown }>(
      "select email, name, roles from users where id = $1 for update",
      [me.id],
    );
    if (!self.rows[0]) throw notFound("Account not found");
    const email = self.rows[0].email;
    const roles = stringArray(self.rows[0].roles);

    if (roles.includes("super_admin")) {
      const others = await client.query<{ n: number }>(
        "select count(*)::int as n from users where 'super_admin' = any(roles) and status = 'active' and id <> $1",
        [me.id],
      );
      if ((others.rows[0]?.n ?? 0) === 0) {
        throw conflict("You are the last active super-admin. Grant the role to someone else first.");
      }
    }

    const presidencies = await client.query<{ name: string }>(
      `select c.name from club_memberships m join clubs c on c.id = m.club_id
        where m.user_id = $1 and m.role = 'president' and m.status = 'active' and c.status = 'active'`,
      [me.id],
    );
    if (presidencies.rows.length > 0) {
      const names = presidencies.rows.map((row) => row.name).join(", ");
      throw conflict(`You are still president of ${names}. Hand the club over before deleting your account.`);
    }

    const leads = await client.query<{ title: string }>(
      "select title from projects where lead_id = $1 and status not in ('rejected','archived')",
      [me.id],
    );
    if (leads.rows.length > 0) {
      const titles = leads.rows.map((row) => row.title).join(", ");
      throw conflict(`You still lead ${titles}. Transfer the project before deleting your account.`);
    }

    // Only blocks when they are the *only* organizer of something upcoming:
    // a co-organizer can take over without any handover step.
    const soleOrganizer = await client.query<{ title: string }>(
      `select e.title from events e
         join event_organizers o on o.event_id = e.id
        where o.user_id = $1 and e.status = 'published' and e.ends_at > now()
          and (select count(*) from event_organizers o2 where o2.event_id = e.id) = 1`,
      [me.id],
    );
    if (soleOrganizer.rows.length > 0) {
      const titles = soleOrganizer.rows.map((row) => row.title).join(", ");
      throw conflict(`You are the only organizer of ${titles}. Add a co-organizer before deleting your account.`);
    }

    await client.query(
      "update media_assets set status = 'deleted', deleted_at = now() where kind = 'avatar' and owner_id = $1 and status = 'ready'",
      [me.id],
    );

    // End memberships and elevated links instead of leaving a ghost president
    // behind. `club_memberships.role` keeps its historical value, but a `left`
    // membership no longer grants anything and no longer shows as active.
    await client.query(
      "update club_memberships set status = 'left', decided_at = now() where user_id = $1 and status in ('active','pending')",
      [me.id],
    );
    await client.query("delete from project_members where user_id = $1", [me.id]);
    await client.query("delete from event_organizers where user_id = $1", [me.id]);

    await client.query(
      `update users
          set status = 'deletion_requested',
              name = 'Former member',
              email = 'deleted-' || id::text || '@invalid.campussphere',
              email_verified = false,
              google_sub = null,
              avatar_url = null,
              bio = null,
              roles = '{student}'::global_role[]
        where id = $1`,
      [me.id],
    );
    await client.query("update sessions set revoked_at = now() where user_id = $1", [me.id]);
    await client.query("delete from notifications where user_id = $1", [me.id]);

    // Mail already queued for this address can no longer legitimately be sent,
    // and the delivery log is the one place a raw address survives deletion.
    await client.query("delete from jobs where kind = 'email' and payload->>'to' = $1 and status <> 'done'", [
      email,
    ]);
    await client.query(
      `update outbound_emails
          set recipient = 'deleted-' || gen_random_uuid()::text || '@invalid.campussphere',
              subject = '[redacted]',
              body = '[redacted at the recipient''s request]'
        where lower(recipient) = lower($1)`,
      [email],
    );

    // Append-only audit rows are not rewritten: the trigger that protects them
    // is a security property, and the row is the record of what an admin did.
    // Retention is documented in PRIVACY.md instead.
    await client.query(
      `insert into audit_events (actor_id, action, entity_type, entity_id, metadata)
       values ($1::uuid, 'user.deletion_requested', 'user', $1::text, '{}'::jsonb)`,
      [me.id],
    );
  });

  await revokeAllSessions(me.id);
  await Promise.all(avatarAssets.map((asset) => deleteObject(asset.object_key)));
  return {
    retained: [
      "Your profile is anonymised: no page, list or export shows your name or address.",
      "Posts, registrations and feedback are kept as content, attributed to \"Former member\".",
      "Delivery records for your address are redacted; your queued mail is discarded.",
      "Audit records of administrative actions are retained (append-only) without being linked to a login.",
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
