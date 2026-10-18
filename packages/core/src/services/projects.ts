import type {
  ApplicationStatus,
  Paginated,
  ProjectApplication,
  ProjectDetail,
  ProjectMember,
  ProjectMilestone,
  ProjectRole,
  ProjectStatus,
  ProjectSummary,
  ProjectTask,
  ProjectUpdate,
  ProjectWorkspace,
  TaskStatus,
} from "@campussphere/contracts";
import type { z } from "zod";
import type { projectProposalInput, projectUpdateInput } from "@campussphere/contracts";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { decodeCursor, encodeCursor, iso, isoRequired, likePattern, many, one, pageLimit, query, slugSuffix, transaction, uniqueSlug } from "../db";
import { isSuperAdmin, type Me } from "../auth";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { enqueueEmail } from "../jobs";

type ProposalInput = z.infer<typeof projectProposalInput>;
type ProjectPatch = z.infer<typeof projectUpdateInput>;

interface ProjectRow {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  status: ProjectStatus;
  cover_url: string | null;
  visibility: "public" | "members";
  created_at: Date;
  approved_at: Date | null;
  lead_id: string;
  lead_name: string;
  lead_avatar: string | null;
  club_id: string | null;
  club_slug: string | null;
  club_name: string | null;
  member_count: number;
  open_roles: number;
}

const projectSelect = `
  p.id, p.slug, p.title, p.summary, p.category, p.status, p.cover_url, p.visibility,
  p.created_at, p.approved_at,
  u.id as lead_id, u.name as lead_name, u.avatar_url as lead_avatar,
  c.id as club_id, c.slug as club_slug, c.name as club_name,
  (select count(*)::int from project_members pm where pm.project_id = p.id) as member_count,
  (select coalesce(sum(greatest(r.slots - (
      select count(*) from project_applications a where a.role_id = r.id and a.status = 'accepted'
   ), 0)), 0)::int from project_roles r where r.project_id = p.id) as open_roles
`;

function toSummary(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category as ProjectSummary["category"],
    status: row.status,
    coverUrl: row.cover_url,
    club: row.club_id ? { id: row.club_id, slug: row.club_slug!, name: row.club_name! } : null,
    lead: { id: row.lead_id, name: row.lead_name, avatarUrl: row.lead_avatar, bio: null },
    memberCount: row.member_count,
    openRoles: row.open_roles,
    createdAt: isoRequired(row.created_at),
    approvedAt: iso(row.approved_at),
  };
}

export async function listProjects(options: {
  category?: string;
  q?: string;
  clubSlug?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<Paginated<ProjectSummary>> {
  const limit = pageLimit(options.limit);
  const cursor = decodeCursor(options.cursor);
  const values: unknown[] = [limit + 1];
  const where = ["p.status = 'approved'", "p.visibility = 'public'"];
  if (options.category) {
    values.push(options.category);
    where.push(`p.category = $${values.length}`);
  }
  if (options.q) {
    values.push(likePattern(options.q));
    where.push(`(p.title ilike $${values.length} or p.summary ilike $${values.length})`);
  }
  if (options.clubSlug) {
    values.push(options.clubSlug);
    where.push(`c.slug = $${values.length}`);
  }
  if (cursor) {
    values.push(cursor.at, cursor.id);
    where.push(`(p.approved_at, p.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
  }
  const rows = await many<ProjectRow>(
    `select ${projectSelect}
       from projects p
       join users u on u.id = p.lead_id
       left join clubs c on c.id = p.club_id
      where ${where.join(" and ")}
      order by p.approved_at desc nulls last, p.id desc
      limit $1`,
    values,
  );
  const items = rows.slice(0, limit).map(toSummary);
  const last = rows.length > limit ? rows[limit - 1] : null;
  return {
    items,
    nextCursor: last?.approved_at ? encodeCursor(last.approved_at, last.id) : null,
  };
}

interface ProjectDetailRow extends ProjectRow {
  description: string;
  goals: string | null;
  expected_impact: string | null;
  timeline: string | null;
  resources: string | null;
  decision_notes: string | null;
}

export async function getProjectBySlug(slug: string, viewer: Me | null): Promise<ProjectDetail> {
  const row = await one<ProjectDetailRow>(
    `select ${projectSelect}, p.description, p.goals, p.expected_impact, p.timeline,
            p.resources, p.decision_notes
       from projects p
       join users u on u.id = p.lead_id
       left join clubs c on c.id = p.club_id
      where p.slug = $1`,
    [slug],
  );
  if (!row) throw notFound("This project does not exist.");

  const [roles, members, updates, myApplication] = await Promise.all([
    many<{ id: string; title: string; description: string | null; slots: number; accepted: number }>(
      `select r.id, r.title, r.description, r.slots,
              (select count(*)::int from project_applications a where a.role_id = r.id and a.status = 'accepted') as accepted
         from project_roles r where r.project_id = $1 order by r.created_at asc`,
      [row.id],
    ),
    many<{ user_id: string; name: string; avatar_url: string | null; role: string; joined_at: Date }>(
      `select pm.user_id, u.name, u.avatar_url, pm.role, pm.joined_at
         from project_members pm join users u on u.id = pm.user_id
        where pm.project_id = $1 order by pm.role desc, pm.joined_at asc`,
      [row.id],
    ),
    many<{ id: string; title: string; body: string; created_at: Date; author_id: string; author_name: string; author_avatar: string | null }>(
      `select pu.id, pu.title, pu.body, pu.created_at, u.id as author_id, u.name as author_name, u.avatar_url as author_avatar
         from project_updates pu join users u on u.id = pu.author_id
        where pu.project_id = $1 order by pu.created_at desc limit 20`,
      [row.id],
    ),
    viewer
      ? one<{ id: string; status: ApplicationStatus }>(
          `select id, status from project_applications
            where project_id = $1 and user_id = $2 and status in ('pending','accepted')
            order by created_at desc limit 1`,
          [row.id, viewer.id],
        )
      : Promise.resolve(null),
  ]);

  const viewerIsLead = viewer?.id === row.lead_id;
  const viewerIsMember = members.some((member) => member.user_id === viewer?.id);

  const isPublic = row.status === "approved" && row.visibility === "public";
  if (!isPublic && !viewerIsLead && !viewerIsMember && !isSuperAdmin(viewer)) {
    throw notFound("This project does not exist.");
  }

  return {
    ...toSummary(row),
    description: row.description,
    goals: row.goals,
    expectedImpact: row.expected_impact,
    timeline: row.timeline,
    resources: row.resources,
    visibility: row.visibility,
    roles: roles.map<ProjectRole>((role) => ({
      id: role.id,
      title: role.title,
      description: role.description,
      slots: role.slots,
      filled: role.accepted,
    })),
    members: members.map<ProjectMember>((member) => ({
      userId: member.user_id,
      name: member.name,
      avatarUrl: member.avatar_url,
      role: member.role as ProjectMember["role"],
      joinedAt: isoRequired(member.joined_at),
    })),
    updates: updates.map<ProjectUpdate>((update) => ({
      id: update.id,
      title: update.title,
      body: update.body,
      author: { id: update.author_id, name: update.author_name, avatarUrl: update.author_avatar, bio: null },
      createdAt: isoRequired(update.created_at),
    })),
    myApplication: myApplication ? { id: myApplication.id, status: myApplication.status } : null,
    canReviewApplications: Boolean(viewerIsLead || isSuperAdmin(viewer)),
  };
}

/* ------------------------------------------------------------------ */
/* Access control                                                      */
/* ------------------------------------------------------------------ */

export async function projectAccess(
  projectId: string,
  viewer: Me | null,
): Promise<{ isLead: boolean; isMember: boolean; status: string; visibility: string; leadId: string }> {
  const row = await one<{ lead_id: string; status: string; visibility: string }>(
    "select lead_id, status, visibility from projects where id = $1",
    [projectId],
  );
  if (!row) throw notFound("Project not found");
  if (!viewer) throw forbidden("Sign in to access this project.");
  const member = await one<{ role: string }>(
    "select role from project_members where project_id = $1 and user_id = $2",
    [projectId, viewer.id],
  );
  const isLead = row.lead_id === viewer.id;
  const isMember = Boolean(member);
  if (!isLead && !isMember && !isSuperAdmin(viewer)) {
    throw forbidden("Only project members can do that.");
  }
  return { isLead, isMember, status: row.status, visibility: row.visibility, leadId: row.lead_id };
}

/* ------------------------------------------------------------------ */
/* Proposals                                                           */
/* ------------------------------------------------------------------ */

async function assertClubAffiliation(clubId: string | null | undefined, me: Me): Promise<void> {
  if (!clubId) return;
  if (isSuperAdmin(me)) return;
  const membership = await one<{ role: string }>(
    "select role from club_memberships where club_id = $1 and user_id = $2 and status = 'active'",
    [clubId, me.id],
  );
  if (!membership || (membership.role !== "officer" && membership.role !== "president")) {
    throw forbidden("Only an officer of that club can submit on its behalf.");
  }
}

export async function createProject(me: Me, input: ProposalInput): Promise<{ id: string; slug: string; status: ProjectStatus }> {
  await assertClubAffiliation(input.clubId, me);
  const slug = await uniqueSlug("projects", input.title);
  const status: ProjectStatus = input.submit ? "submitted" : "draft";
  const submittedAt = input.submit ? new Date() : null;

  return transaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `insert into projects (slug, club_id, lead_id, title, summary, description, category, status,
                             visibility, goals, expected_impact, timeline, resources, submitted_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
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
        input.visibility ?? "public",
        input.goals ?? null,
        input.expectedImpact ?? null,
        input.timeline ?? null,
        input.resources ?? null,
        submittedAt,
      ],
    );
    const id = inserted.rows[0]!.id;
    for (const role of input.roles ?? []) {
      await client.query(
        "insert into project_roles (project_id, title, description, slots) values ($1,$2,$3,$4)",
        [id, role.title, role.description ?? null, role.slots],
      );
    }
    await client.query(
      "insert into project_members (project_id, user_id, role) values ($1,$2,'lead')",
      [id, me.id],
    );
    await writeAudit(
      {
        actorId: me.id,
        action: input.submit ? "project.submitted" : "project.created",
        entityType: "project",
        entityId: id,
        metadata: { title: input.title, clubId: input.clubId ?? null },
      },
      client,
    );
    return { id, slug, status };
  });
}

export async function updateProject(projectId: string, me: Me, patch: ProjectPatch): Promise<void> {
  const access = await projectAccess(projectId, me);
  if (!access.isLead && !isSuperAdmin(me)) throw forbidden("Only the project lead can edit this project.");
  if (access.status === "archived") throw conflict("Archived projects cannot be edited.");
  const submit = patch.submit === true;
  const editableForContent = ["draft", "submitted", "changes_requested", "rejected"].includes(access.status);
  if (!editableForContent && Object.keys(patch).some((key) => key !== "submit" && key !== "visibility" && key !== "description" && key !== "goals" && key !== "expectedImpact" && key !== "timeline" && key !== "resources")) {
    throw conflict("An approved project can only update its narrative fields.");
  }

  const columns: Record<string, string> = {
    title: "title",
    summary: "summary",
    description: "description",
    category: "category",
    goals: "goals",
    expectedImpact: "expected_impact",
    timeline: "timeline",
    resources: "resources",
    clubId: "club_id",
    visibility: "visibility",
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.clubId !== undefined) await assertClubAffiliation(patch.clubId, me);
  for (const [key, column] of Object.entries(columns)) {
    if (key in patch) {
      values.push((patch as Record<string, unknown>)[key] ?? null);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (sets.length === 0 && !submit) throw badRequest("Nothing to update");

  if (sets.length > 0) {
    values.push(projectId);
    await query(`update projects set ${sets.join(", ")} where id = $${values.length}`, values);
  }

  if (submit) {
    if (!["draft", "changes_requested", "rejected"].includes(access.status)) {
      throw conflict("Only drafts or changes-requested projects can be submitted.");
    }
    await query(
      "update projects set status = 'submitted', submitted_at = now(), decision_notes = null where id = $1",
      [projectId],
    );
  }
  await writeAudit({
    actorId: me.id,
    action: submit ? "project.submitted" : "project.updated",
    entityType: "project",
    entityId: projectId,
    metadata: { fields: Object.keys(patch) },
  });
}

export async function decideProject(
  projectId: string,
  me: Me,
  decision: "approve" | "reject" | "request_changes",
  notes?: string | null,
): Promise<void> {
  if (!isSuperAdmin(me)) throw forbidden("Only a super-admin can review proposals.");
  const project = await one<{
    id: string;
    slug: string;
    title: string;
    lead_id: string;
    lead_email: string;
    lead_name: string;
    status: string;
  }>(
    `select p.id, p.slug, p.title, p.lead_id, p.status, u.email as lead_email, u.name as lead_name
       from projects p join users u on u.id = p.lead_id where p.id = $1`,
    [projectId],
  );
  if (!project) throw notFound("Project not found");
  if (project.status === "draft") throw conflict("This proposal has not been submitted yet.");

  const status: ProjectStatus =
    decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "changes_requested";
  const approvedAt = decision === "approve" ? new Date() : null;
  await query(
    `update projects
        set status = $2::project_status, decision_notes = $3, decided_by = $4, decided_at = now(),
            approved_at = $5
      where id = $1`,
    [project.id, status, notes ?? null, me.id, approvedAt],
  );
  await writeAudit({
    actorId: me.id,
    action: "project.decision",
    entityType: "project",
    entityId: project.id,
    metadata: { decision, notes: notes ?? null, previousStatus: project.status },
  });

  const title =
    decision === "approve"
      ? `Your project "${project.title}" was approved`
      : decision === "reject"
        ? `Your project "${project.title}" was not approved`
        : `Changes requested for "${project.title}"`;
  await notify({
    userId: project.lead_id,
    kind: "project_decision",
    title,
    body: notes || (decision === "approve" ? "It is now listed publicly." : "See the review notes in your project."),
    link: decision === "approve" ? `/projects/${project.slug}` : "/dashboard/projects",
  });
  await enqueueEmail(
    project.lead_email,
    title,
    `Hi ${project.lead_name},\n\n${title}.\n${notes ? `\nReview notes:\n${notes}\n` : ""}\nOpen CampusSphere to review the project.`,
  );
}

/* ------------------------------------------------------------------ */
/* Applications                                                        */
/* ------------------------------------------------------------------ */

export async function applyToProject(
  projectId: string,
  me: Me,
  input: { roleId?: string | null; message: string },
): Promise<{ id: string; status: ApplicationStatus }> {
  const project = await one<{ id: string; slug: string; title: string; lead_id: string; status: string; visibility: string }>(
    "select id, slug, title, lead_id, status, visibility from projects where id = $1",
    [projectId],
  );
  if (!project) throw notFound("Project not found");
  if (project.status !== "approved" || project.visibility !== "public") {
    throw conflict("This project is not open for applications.");
  }
  if (project.lead_id === me.id) throw conflict("You already lead this project.");
  const existingMember = await one("select 1 from project_members where project_id = $1 and user_id = $2", [
    projectId,
    me.id,
  ]);
  if (existingMember) throw conflict("You are already on this project.");
  const existing = await one<{ id: string }>(
    "select id from project_applications where project_id = $1 and user_id = $2 and status = 'pending'",
    [projectId, me.id],
  );
  if (existing) throw conflict("Your application is already pending.");

  if (input.roleId) {
    const role = await one<{ id: string; slots: number; accepted: number }>(
      `select r.id, r.slots,
              (select count(*)::int from project_applications a where a.role_id = r.id and a.status = 'accepted') as accepted
         from project_roles r where r.id = $1 and r.project_id = $2`,
      [input.roleId, projectId],
    );
    if (!role) throw badRequest("That role does not belong to this project.");
    if (role.accepted >= role.slots) throw conflict("That role is already filled.");
  }

  const inserted = await one<{ id: string }>(
    `insert into project_applications (project_id, role_id, user_id, message)
     values ($1,$2,$3,$4) returning id`,
    [projectId, input.roleId ?? null, me.id, input.message],
  );
  await writeAudit({
    actorId: me.id,
    action: "project.application_submitted",
    entityType: "project",
    entityId: projectId,
    metadata: { applicationId: inserted!.id },
  });
  await notify({
    userId: project.lead_id,
    kind: "project_application_received",
    title: `New application for ${project.title}`,
    body: `${me.name} applied to join.`,
    link: `/dashboard/projects/${projectId}#applications`,
  });
  return { id: inserted!.id, status: "pending" };
}

export async function withdrawApplication(projectId: string, applicationId: string, me: Me): Promise<void> {
  const result = await query(
    `update project_applications set status = 'withdrawn', decided_at = now()
      where id = $1 and project_id = $2 and user_id = $3 and status = 'pending'`,
    [applicationId, projectId, me.id],
  );
  if (result.rowCount === 0) throw notFound("Pending application not found");
}

export async function listProjectApplications(projectId: string, me: Me): Promise<ProjectApplication[]> {
  const access = await projectAccess(projectId, me);
  if (!access.isLead && !isSuperAdmin(me)) throw forbidden("Only the project lead can review applications.");
  const rows = await many<{
    id: string;
    role_id: string | null;
    role_title: string | null;
    status: ApplicationStatus;
    message: string;
    created_at: Date;
    decided_at: Date | null;
    user_id: string;
    name: string;
    avatar_url: string | null;
  }>(
    `select a.id, a.role_id, r.title as role_title, a.status, a.message, a.created_at, a.decided_at,
            u.id as user_id, u.name, u.avatar_url
       from project_applications a
       join users u on u.id = a.user_id
       left join project_roles r on r.id = a.role_id
      where a.project_id = $1
      order by (a.status = 'pending') desc, a.created_at asc`,
    [projectId],
  );
  return rows.map((row) => ({
    id: row.id,
    projectId,
    roleId: row.role_id,
    roleTitle: row.role_title,
    user: { id: row.user_id, name: row.name, avatarUrl: row.avatar_url, bio: null },
    message: row.message,
    status: row.status,
    createdAt: isoRequired(row.created_at),
    decidedAt: iso(row.decided_at),
  }));
}

export async function decideApplication(
  projectId: string,
  applicationId: string,
  me: Me,
  decision: { decision: "accepted" | "declined"; note?: string | null },
): Promise<void> {
  const access = await projectAccess(projectId, me);
  if (!access.isLead && !isSuperAdmin(me)) throw forbidden("Only the project lead can decide applications.");

  await transaction(async (client) => {
    // Serialise decisions per project so two accepts cannot exceed a role's slots.
    await client.query("select id from projects where id = $1 for update", [projectId]);
    const application = await client.query<{
      id: string;
      user_id: string;
      status: ApplicationStatus;
      role_id: string | null;
      role_title: string | null;
      project_title: string;
      project_slug: string;
    }>(
      `select a.id, a.user_id, a.status, a.role_id, r.title as role_title,
              p.title as project_title, p.slug as project_slug
         from project_applications a
         join projects p on p.id = a.project_id
         left join project_roles r on r.id = a.role_id
        where a.id = $1 and a.project_id = $2`,
      [applicationId, projectId],
    );
    const row = application.rows[0];
    if (!row) throw notFound("Application not found");
    if (row.status !== "pending") throw conflict("This application was already decided.");

    if (decision.decision === "accepted" && row.role_id) {
      const capacity = await client.query<{ slots: number; accepted: number }>(
        `select r.slots,
                (select count(*)::int from project_applications a
                  where a.role_id = r.id and a.status = 'accepted') as accepted
           from project_roles r where r.id = $1`,
        [row.role_id],
      );
      const role = capacity.rows[0];
      if (!role || role.accepted >= role.slots) throw conflict("That role is already filled.");
    }

    await client.query(
      `update project_applications set status = $2, decided_by = $3, decided_at = now() where id = $1`,
      [applicationId, decision.decision, me.id],
    );
    if (decision.decision === "accepted") {
      await client.query(
        `insert into project_members (project_id, user_id, role) values ($1,$2,'member')
         on conflict (project_id, user_id) do nothing`,
        [projectId, row.user_id],
      );
    }
    await writeAudit(
      {
        actorId: me.id,
        action: "project.application_decided",
        entityType: "project",
        entityId: projectId,
        metadata: { applicationId, decision: decision.decision },
      },
      client,
    );
  });

  const info = await one<{ project_title: string; project_slug: string; user_id: string; role_title: string | null }>(
    `select p.title as project_title, p.slug as project_slug, a.user_id, r.title as role_title
       from project_applications a join projects p on p.id = a.project_id
       left join project_roles r on r.id = a.role_id
      where a.id = $1`,
    [applicationId],
  );
  if (info) {
    await notify({
      userId: info.user_id,
      kind: "project_application_decided",
      title:
        decision.decision === "accepted"
          ? `You joined ${info.project_title}`
          : `Application update for ${info.project_title}`,
      body:
        decision.decision === "accepted"
          ? `You are now a member${info.role_title ? ` as ${info.role_title}` : ""}.`
          : decision.note || "The project lead declined your application.",
      link: decision.decision === "accepted" ? `/dashboard/projects/${projectId}` : `/projects/${info.project_slug}`,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Workspace                                                           */
/* ------------------------------------------------------------------ */

export async function getProjectWorkspace(projectId: string, me: Me): Promise<ProjectWorkspace> {
  const access = await projectAccess(projectId, me);
  const [tasks, milestones, applications, members] = await Promise.all([
    many<{
      id: string;
      title: string;
      description: string | null;
      status: TaskStatus;
      due_date: Date | null;
      created_at: Date;
      assignee_id: string | null;
      assignee_name: string | null;
      assignee_avatar: string | null;
    }>(
      `select t.id, t.title, t.description, t.status, t.due_date, t.created_at,
              u.id as assignee_id, u.name as assignee_name, u.avatar_url as assignee_avatar
         from project_tasks t left join users u on u.id = t.assignee_id
        where t.project_id = $1
        order by case t.status when 'doing' then 0 when 'todo' then 1 else 2 end, t.created_at asc`,
      [projectId],
    ),
    many<{ id: string; title: string; description: string | null; due_date: Date | null; completed_at: Date | null }>(
      `select id, title, description, due_date, completed_at from project_milestones
        where project_id = $1 order by coalesce(due_date, created_at) asc`,
      [projectId],
    ),
    access.isLead || isSuperAdmin(me) ? listProjectApplications(projectId, me) : Promise.resolve([]),
    many<{ user_id: string; name: string; avatar_url: string | null; role: string; joined_at: Date }>(
      `select pm.user_id, u.name, u.avatar_url, pm.role, pm.joined_at
         from project_members pm join users u on u.id = pm.user_id
        where pm.project_id = $1 order by pm.role desc, pm.joined_at asc`,
      [projectId],
    ),
  ]);

  return {
    tasks: tasks.map<ProjectTask>((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      assignee: task.assignee_id
        ? { id: task.assignee_id, name: task.assignee_name!, avatarUrl: task.assignee_avatar, bio: null }
        : null,
      dueDate: iso(task.due_date),
      createdAt: isoRequired(task.created_at),
    })),
    milestones: milestones.map<ProjectMilestone>((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      description: milestone.description,
      dueDate: iso(milestone.due_date),
      completedAt: iso(milestone.completed_at),
    })),
    applications,
    members: members.map<ProjectMember>((member) => ({
      userId: member.user_id,
      name: member.name,
      avatarUrl: member.avatar_url,
      role: member.role as ProjectMember["role"],
      joinedAt: isoRequired(member.joined_at),
    })),
    viewerRole: access.isLead ? "lead" : "member",
  };
}

export async function createTask(projectId: string, me: Me, input: { title: string; description?: string | null; status?: TaskStatus; assigneeId?: string | null; dueDate?: string | null }): Promise<{ id: string }> {
  await projectAccess(projectId, me);
  if (input.assigneeId) {
    const member = await one("select 1 from project_members where project_id = $1 and user_id = $2", [
      projectId,
      input.assigneeId,
    ]);
    if (!member) throw badRequest("Assignees must be project members.");
  }
  const inserted = await one<{ id: string }>(
    `insert into project_tasks (project_id, title, description, status, assignee_id, due_date, created_by)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [
      projectId,
      input.title,
      input.description ?? null,
      input.status ?? "todo",
      input.assigneeId ?? null,
      input.dueDate ?? null,
      me.id,
    ],
  );
  await writeAudit({
    actorId: me.id,
    action: "project.task_created",
    entityType: "project",
    entityId: projectId,
    metadata: { taskId: inserted!.id },
  });
  return { id: inserted!.id };
}

export async function updateTask(
  projectId: string,
  taskId: string,
  me: Me,
  patch: { title?: string; description?: string | null; status?: TaskStatus; assigneeId?: string | null; dueDate?: string | null },
): Promise<void> {
  await projectAccess(projectId, me);
  if (patch.assigneeId) {
    const member = await one("select 1 from project_members where project_id = $1 and user_id = $2", [
      projectId,
      patch.assigneeId,
    ]);
    if (!member) throw badRequest("Assignees must be project members.");
  }
  const columns: Record<string, string> = {
    title: "title",
    description: "description",
    status: "status",
    assigneeId: "assignee_id",
    dueDate: "due_date",
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(columns)) {
    if (key in patch) {
      values.push((patch as Record<string, unknown>)[key] ?? null);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (sets.length === 0) throw badRequest("Nothing to update");
  values.push(taskId, projectId);
  const result = await query(
    `update project_tasks set ${sets.join(", ")}
      where id = $${values.length - 1} and project_id = $${values.length}`,
    values,
  );
  if (result.rowCount === 0) throw notFound("Task not found");
}

export async function createMilestone(
  projectId: string,
  me: Me,
  input: { title: string; description?: string | null; dueDate?: string | null },
): Promise<{ id: string }> {
  const access = await projectAccess(projectId, me);
  if (!access.isLead && !isSuperAdmin(me)) throw forbidden("Only the project lead can add milestones.");
  const inserted = await one<{ id: string }>(
    `insert into project_milestones (project_id, title, description, due_date)
     values ($1,$2,$3,$4) returning id`,
    [projectId, input.title, input.description ?? null, input.dueDate ?? null],
  );
  await writeAudit({
    actorId: me.id,
    action: "project.milestone_created",
    entityType: "project",
    entityId: projectId,
    metadata: { milestoneId: inserted!.id },
  });
  return { id: inserted!.id };
}

export async function updateMilestone(
  projectId: string,
  milestoneId: string,
  me: Me,
  patch: { completed?: boolean; title?: string; dueDate?: string | null },
): Promise<void> {
  const access = await projectAccess(projectId, me);
  if (!access.isLead && !isSuperAdmin(me)) throw forbidden("Only the project lead can update milestones.");
  const result = await query(
    `update project_milestones
        set completed_at = case
              when $2::boolean is true then coalesce(completed_at, now())
              when $2::boolean is false then null
              else completed_at end,
            title = coalesce($3, title),
            due_date = coalesce($4, due_date)
      where id = $1 and project_id = $5`,
    [milestoneId, patch.completed ?? null, patch.title ?? null, patch.dueDate ?? null, projectId],
  );
  if (result.rowCount === 0) throw notFound("Milestone not found");
}

export async function publishProjectUpdate(
  projectId: string,
  me: Me,
  input: { title: string; body: string },
): Promise<{ id: string }> {
  const access = await projectAccess(projectId, me);
  if (!access.isLead && !isSuperAdmin(me)) throw forbidden("Only the project lead can publish updates.");
  const inserted = await one<{ id: string }>(
    `insert into project_updates (project_id, author_id, title, body) values ($1,$2,$3,$4) returning id`,
    [projectId, me.id, input.title, input.body],
  );
  await writeAudit({
    actorId: me.id,
    action: "project.update_published",
    entityType: "project",
    entityId: projectId,
    metadata: { updateId: inserted!.id },
  });
  return { id: inserted!.id };
}

export async function removeProjectMember(projectId: string, userId: string, me: Me): Promise<void> {
  const access = await projectAccess(projectId, me);
  if (!access.isLead && !isSuperAdmin(me)) throw forbidden("Only the project lead can remove members.");
  if (userId === access.leadId) throw conflict("The lead cannot be removed from their own project.");
  const result = await query("delete from project_members where project_id = $1 and user_id = $2", [
    projectId,
    userId,
  ]);
  if (result.rowCount === 0) throw notFound("That person is not a project member.");
  await writeAudit({
    actorId: me.id,
    action: "project.member_removed",
    entityType: "project",
    entityId: projectId,
    metadata: { removedUserId: userId },
  });
  await notify({
    userId,
    kind: "system",
    title: "You were removed from a project",
    body: "A project lead removed you from the project team.",
    link: null,
  });
}

/* ------------------------------------------------------------------ */
/* Dashboards                                                          */
/* ------------------------------------------------------------------ */

export interface ProjectCard {
  id: string;
  slug: string;
  title: string;
  status: ProjectStatus;
  role: "lead" | "member";
  openApplications: number;
  updatedAt: string;
}

export async function myProjects(me: Me): Promise<{ led: ProjectCard[]; joined: ProjectCard[] }> {
  const rows = await many<{
    id: string;
    slug: string;
    title: string;
    status: ProjectStatus;
    membership_role: string;
    open_applications: number;
    updated_at: Date;
  }>(
    `select p.id, p.slug, p.title, p.status, pm.role as membership_role,
            (select count(*)::int from project_applications a where a.project_id = p.id and a.status = 'pending') as open_applications,
            p.updated_at
       from projects p join project_members pm on pm.project_id = p.id
      where pm.user_id = $1
      order by p.updated_at desc`,
    [me.id],
  );
  const cards = rows.map<ProjectCard>((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    role: row.membership_role === "lead" ? "lead" : "member",
    openApplications: row.open_applications,
    updatedAt: isoRequired(row.updated_at),
  }));
  return { led: cards.filter((card) => card.role === "lead"), joined: cards.filter((card) => card.role === "member") };
}

export async function pendingProjectProposals(): Promise<
  Array<ProjectSummary & { submittedAt: string | null; proposalClub: string | null }>
> {
  const rows = await many<ProjectRow & { submitted_at: Date | null }>(
    `select ${projectSelect}, p.submitted_at
       from projects p join users u on u.id = p.lead_id
       left join clubs c on c.id = p.club_id
      where p.status = 'submitted'
      order by p.submitted_at asc limit 100`,
  );
  return rows.map((row) => ({
    ...toSummary(row),
    submittedAt: iso(row.submitted_at),
    proposalClub: row.club_name,
  }));
}

export function randomSlugSuffix(): string {
  return slugSuffix();
}

/** Loads a project for its workspace, enforcing membership. */
export async function getProjectForMember(projectId: string, me: Me): Promise<ProjectDetail> {
  const row = await one<{ slug: string }>("select slug from projects where id = $1", [projectId]);
  if (!row) throw notFound("Project not found");
  const project = await getProjectBySlug(row.slug, me);
  return project;
}
