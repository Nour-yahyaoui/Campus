"use server";

import {
  applicationDecisionInput,
  milestoneInput,
  milestoneUpdateInput,
  projectApplicationInput,
  projectDecisionInput,
  projectMemberInput,
  projectProposalInput,
  projectUpdateInput,
  projectUpdatePostInput,
  taskInput,
  taskUpdateInput,
} from "@campussphere/contracts";
import {
  applyToProject,
  createMilestone,
  createProject,
  createTask,
  decideApplication,
  decideProject,
  publishProjectUpdate,
  removeProjectMember,
  updateMilestone,
  updateProject,
  updateTask,
  withdrawApplication,
} from "@campussphere/core";
import { back, errorMessage, isRedirect, isoFromLocal, nullable, opt, str } from "@/lib/forms";
import { requireUser } from "@/lib/session";
import { requireWritesEnabled } from "@campussphere/core";

export async function createProjectAction(formData: FormData): Promise<void> {
  await requireWritesEnabled();
  const me = await requireUser("/dashboard/projects/new");
  const parsed = projectProposalInput.safeParse({
    title: str(formData, "title"),
    summary: str(formData, "summary"),
    description: str(formData, "description"),
    category: str(formData, "category"),
    goals: nullable(formData, "goals"),
    expectedImpact: nullable(formData, "expectedImpact"),
    timeline: nullable(formData, "timeline"),
    resources: nullable(formData, "resources"),
    clubId: nullable(formData, "clubId"),
    visibility: str(formData, "visibility") === "members" ? "members" : "public",
    roles: (() => {
      const titles = formData.getAll("roleTitle").map(String);
      const slots = formData.getAll("roleSlots").map(String);
      return titles
        .map((title, index) => ({
          title: title.trim(),
          description: null,
          slots: Number(slots[index] ?? 1) || 1,
        }))
        .filter((role) => role.title.length > 0);
    })(),
    submit: str(formData, "intent") === "submit",
  });
  if (!parsed.success) {
    back("/dashboard/projects/new", { error: parsed.error.issues[0]?.message ?? "Check the form." });
  }
  try {
    const created = await createProject(me, parsed.data);
    back(created.status === "submitted" ? "/dashboard" : `/dashboard/projects/${created.id}`, {
      ok: created.status === "submitted" ? "Proposal submitted for review." : "Draft saved.",
    });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back("/dashboard/projects/new", { error: errorMessage(error) });
  }
}

export async function updateProjectAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  await requireWritesEnabled();
  const me = await requireUser(`/dashboard/projects/${projectId}`);
  const patch: Record<string, unknown> = {};
  for (const key of ["title", "summary", "description", "category", "goals", "expectedImpact", "timeline", "resources", "visibility"]) {
    const raw = formData.get(key);
    if (typeof raw === "string" && raw.length > 0) patch[key] = raw;
  }
  if (formData.get("clubId") !== null) patch.clubId = nullable(formData, "clubId");
  if (str(formData, "intent") === "submit") patch.submit = true;
  const parsed = projectUpdateInput.safeParse(patch);
  if (!parsed.success) back(`/dashboard/projects/${projectId}`, { error: parsed.error.issues[0]?.message ?? "Check the form." });
  try {
    await updateProject(projectId, me, parsed.data);
    back(`/dashboard/projects/${projectId}`, { ok: "Project updated." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/dashboard/projects/${projectId}`, { error: errorMessage(error) });
  }
}

export async function applyToProjectAction(formData: FormData): Promise<void> {
  const slug = str(formData, "slug");
  await requireWritesEnabled();
  const me = await requireUser(`/projects/${slug}`);
  const parsed = projectApplicationInput.safeParse({
    roleId: nullable(formData, "roleId"),
    message: str(formData, "message"),
  });
  if (!parsed.success) back(`/projects/${slug}`, { error: parsed.error.issues[0]?.message ?? "Write a short message." });
  try {
    await applyToProject(str(formData, "projectId"), me, parsed.data);
    back(`/projects/${slug}`, { ok: "Application sent to the project lead." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/projects/${slug}`, { error: errorMessage(error) });
  }
}

export async function decideApplicationAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  await requireWritesEnabled();
  const me = await requireUser(`/dashboard/projects/${projectId}`);
  const parsed = applicationDecisionInput.safeParse({
    decision: str(formData, "decision"),
    note: nullable(formData, "note"),
  });
  if (!parsed.success) back(`/dashboard/projects/${projectId}`, { error: "Pick accept or decline." });
  try {
    await decideApplication(projectId, str(formData, "applicationId"), me, parsed.data);
    back(`/dashboard/projects/${projectId}`, { ok: `Application ${parsed.data.decision}.` });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/dashboard/projects/${projectId}`, { error: errorMessage(error) });
  }
}

export async function decideProjectAction(formData: FormData): Promise<void> {
  await requireWritesEnabled();
  const me = await requireUser("/admin");
  const parsed = projectDecisionInput.safeParse({
    decision: str(formData, "decision"),
    notes: nullable(formData, "notes"),
  });
  if (!parsed.success) back("/admin?tab=projects", { error: parsed.error.issues[0]?.message ?? "Check the decision." });
  try {
    await decideProject(str(formData, "projectId"), me, parsed.data.decision, parsed.data.notes);
    back("/admin?tab=projects", { ok: `Project ${parsed.data.decision.replace("_", " ")}.` });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back("/admin?tab=projects", { error: errorMessage(error) });
  }
}

export async function createTaskAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  await requireWritesEnabled();
  const me = await requireUser(`/dashboard/projects/${projectId}`);
  const parsed = taskInput.safeParse({
    title: str(formData, "title"),
    description: nullable(formData, "description"),
    status: opt(formData, "status"),
    assigneeId: nullable(formData, "assigneeId"),
    dueDate: isoFromLocal(formData, "dueDate") ?? null,
  });
  if (!parsed.success) back(`/dashboard/projects/${projectId}`, { error: parsed.error.issues[0]?.message ?? "Check the task." });
  try {
    await createTask(projectId, me, parsed.data);
    back(`/dashboard/projects/${projectId}`, { ok: "Task added." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/dashboard/projects/${projectId}`, { error: errorMessage(error) });
  }
}

export async function updateTaskAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  await requireWritesEnabled();
  const me = await requireUser(`/dashboard/projects/${projectId}`);
  const status = str(formData, "status");
  const parsed = taskUpdateInput.safeParse(
    status ? { status } : { title: str(formData, "title") },
  );
  if (!parsed.success) back(`/dashboard/projects/${projectId}`, { error: "Check the task update." });
  try {
    await updateTask(projectId, str(formData, "taskId"), me, parsed.data);
    back(`/dashboard/projects/${projectId}`, { ok: "Task updated." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/dashboard/projects/${projectId}`, { error: errorMessage(error) });
  }
}

export async function createMilestoneAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  await requireWritesEnabled();
  const me = await requireUser(`/dashboard/projects/${projectId}`);
  const parsed = milestoneInput.safeParse({
    title: str(formData, "title"),
    description: nullable(formData, "description"),
    dueDate: isoFromLocal(formData, "dueDate") ?? null,
  });
  if (!parsed.success) back(`/dashboard/projects/${projectId}`, { error: parsed.error.issues[0]?.message ?? "Check the milestone." });
  try {
    await createMilestone(projectId, me, parsed.data);
    back(`/dashboard/projects/${projectId}`, { ok: "Milestone added." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/dashboard/projects/${projectId}`, { error: errorMessage(error) });
  }
}

export async function toggleMilestoneAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  await requireWritesEnabled();
  const me = await requireUser(`/dashboard/projects/${projectId}`);
  const parsed = milestoneUpdateInput.safeParse({ completed: str(formData, "completed") === "true" });
  if (!parsed.success) back(`/dashboard/projects/${projectId}`, { error: "Check the milestone update." });
  try {
    await updateMilestone(projectId, str(formData, "milestoneId"), me, parsed.data);
    back(`/dashboard/projects/${projectId}`, { ok: "Milestone updated." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/dashboard/projects/${projectId}`, { error: errorMessage(error) });
  }
}

export async function postProjectUpdateAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  await requireWritesEnabled();
  const me = await requireUser(`/dashboard/projects/${projectId}`);
  const parsed = projectUpdatePostInput.safeParse({
    title: str(formData, "title"),
    body: str(formData, "body"),
  });
  if (!parsed.success) back(`/dashboard/projects/${projectId}`, { error: parsed.error.issues[0]?.message ?? "Check the update." });
  try {
    await publishProjectUpdate(projectId, me, parsed.data);
    back(`/dashboard/projects/${projectId}`, { ok: "Update published." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/dashboard/projects/${projectId}`, { error: errorMessage(error) });
  }
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  await requireWritesEnabled();
  const me = await requireUser(`/dashboard/projects/${projectId}`);
  const parsed = projectMemberInput.safeParse({ userId: str(formData, "userId") });
  if (!parsed.success) back(`/dashboard/projects/${projectId}`, { error: "Check the member." });
  try {
    await removeProjectMember(projectId, parsed.data.userId, me);
    back(`/dashboard/projects/${projectId}`, { ok: "Member removed." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/dashboard/projects/${projectId}`, { error: errorMessage(error) });
  }
}

export async function withdrawApplicationAction(formData: FormData): Promise<void> {
  const slug = str(formData, "slug");
  await requireWritesEnabled();
  const me = await requireUser(`/projects/${slug}`);
  try {
    await withdrawApplication(str(formData, "projectId"), str(formData, "applicationId"), me);
    back(`/projects/${slug}`, { ok: "Application withdrawn." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/projects/${slug}`, { error: errorMessage(error) });
  }
}
