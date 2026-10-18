import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PROJECT_CATEGORIES } from "@campussphere/contracts";
import { categoryLabel } from "@/lib/format";
import { clubsWhereOfficer, getProjectForMember, getProjectWorkspace } from "@campussphere/core";
import { currentUser } from "@/lib/session";
import { formatDateTime, titleCase } from "@/lib/format";
import { Avatar, Notice, Tag } from "@/components/Pieces";
import {
  createMilestoneAction,
  createTaskAction,
  decideApplicationAction,
  postProjectUpdateAction,
  removeMemberAction,
  toggleMilestoneAction,
  updateProjectAction,
  updateTaskAction,
} from "@/app/actions/projects";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata: Metadata = { title: "Project workspace", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ProjectWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const messages = await searchParams;
  const me = await currentUser();
  if (!me) redirect(`/login?next=/dashboard/projects/${id}`);

  let project;
  let workspace;
  try {
    project = await getProjectForMember(id, me);
    workspace = await getProjectWorkspace(id, me);
  } catch {
    notFound();
  }
  const isLead = workspace.viewerRole === "lead";
  const clubs = await clubsWhereOfficer(me.id);

  return (
    <div className="shell">
      <div className="page-head">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/dashboard">Dashboard</Link> <span aria-hidden="true">/</span> <span>{project.title}</span>
        </nav>
        <div className="tag-row" style={{ marginBottom: 8 }}>
          <Tag tone={project.status === "approved" ? "forest" : project.status === "rejected" ? "danger" : "marigold"}>
            {titleCase(project.status)}
          </Tag>
          <Tag>{workspace.viewerRole}</Tag>
          {project.status === "approved" ? (
            <Link className="tag" href={`/projects/${project.slug}`}>Public page</Link>
          ) : null}
        </div>
        <h1>{project.title}</h1>
        <p className="lede">{project.summary}</p>
      </div>

      {messages.ok ? <Notice>{messages.ok}</Notice> : null}
      {messages.error ? <Notice tone="danger">{messages.error}</Notice> : null}

      {(project.status === "draft" || project.status === "changes_requested" || project.status === "rejected") && isLead ? (
        <div className="callout">
          {project.status === "changes_requested"
            ? "A reviewer asked for changes. Update the proposal below and submit again."
            : project.status === "rejected"
              ? "This proposal was rejected. You can revise and resubmit if the reviewer agreed."
              : "This is a private draft. Submit it when you are ready for review."}
          <form action={updateProjectAction} className="mt-1">
            <input type="hidden" name="projectId" value={project.id} />
            <SubmitButton className="btn btn-primary btn-sm" name="intent" value="submit">Submit for review</SubmitButton>
          </form>
        </div>
      ) : null}

      <div className="dash-grid">
        <section className="card" id="applications">
          <h2 style={{ fontSize: "1.2rem" }}>Applications</h2>
          {!isLead ? (
            <p className="small muted">Only the project lead can review applications.</p>
          ) : workspace.applications.length === 0 ? (
            <p className="small muted">No applications yet.</p>
          ) : (
            <div className="stack">
              {workspace.applications.map((application) => (
                <div key={application.id} className="card card-flat" style={{ background: "var(--paper)" }}>
                  <div className="spread">
                    <div className="row" style={{ gap: 8 }}>
                      <Avatar name={application.user.name} />
                      <div>
                        <div className="small">{application.user.name}</div>
                        <div className="tiny muted">
                          {application.roleTitle ?? "General application"} · {formatDateTime(application.createdAt)}
                        </div>
                      </div>
                    </div>
                    <Tag tone={application.status === "accepted" ? "forest" : application.status === "declined" ? "danger" : "marigold"}>
                      {application.status}
                    </Tag>
                  </div>
                  <p className="small" style={{ whiteSpace: "pre-wrap", margin: "10px 0" }}>{application.message}</p>
                  {application.status === "pending" ? (
                    <div className="row">
                      <form action={decideApplicationAction}>
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="applicationId" value={application.id} />
                        <input type="hidden" name="decision" value="accepted" />
                        <SubmitButton className="btn btn-primary btn-sm">Accept</SubmitButton>
                      </form>
                      <form action={decideApplicationAction}>
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="applicationId" value={application.id} />
                        <input type="hidden" name="decision" value="declined" />
                        <SubmitButton className="btn btn-secondary btn-sm">Decline</SubmitButton>
                      </form>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2 style={{ fontSize: "1.2rem" }}>Team</h2>
          {workspace.members.map((member) => (
            <div key={member.userId} className="member-row">
              <Avatar name={member.name} />
              <div style={{ flex: 1 }}>
                <div className="small">{member.name}</div>
                <div className="tiny muted">{member.role}</div>
              </div>
              {isLead && member.role !== "lead" ? (
                <form action={removeMemberAction}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="userId" value={member.userId} />
                  <SubmitButton className="btn btn-ghost btn-sm" confirm={`Remove ${member.name}?`}>Remove</SubmitButton>
                </form>
              ) : null}
            </div>
          ))}
        </section>

        <section className="card">
          <h2 style={{ fontSize: "1.2rem" }}>Tasks</h2>
          <form action={createTaskAction} className="stack" style={{ marginBottom: 16 }}>
            <input type="hidden" name="projectId" value={project.id} />
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="task-title">New task</label>
              <input className="input" id="task-title" name="title" required maxLength={200} placeholder="e.g. Order sensors" />
            </div>
            <div className="form-grid two">
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="task-assignee">Assignee</label>
                <select className="select" id="task-assignee" name="assigneeId" defaultValue="">
                  <option value="">Unassigned</option>
                  {workspace.members.map((member) => (
                    <option key={member.userId} value={member.userId}>{member.name}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="task-due">Due date</label>
                <input className="input" id="task-due" name="dueDate" type="date" />
              </div>
            </div>
            <SubmitButton className="btn btn-secondary btn-sm">Add task</SubmitButton>
          </form>

          {workspace.tasks.length === 0 ? (
            <p className="small muted">No tasks yet.</p>
          ) : (
            <div className="stack">
              {workspace.tasks.map((task) => (
                <div key={task.id} className="card card-flat" style={{ background: "var(--paper)", padding: 12 }}>
                  <div className="spread">
                    <strong className="small">{task.title}</strong>
                    <Tag tone={task.status === "done" ? "forest" : task.status === "doing" ? "marigold" : undefined}>
                      {task.status}
                    </Tag>
                  </div>
                  <div className="tiny muted">
                    {task.assignee ? task.assignee.name : "Unassigned"}
                    {task.dueDate ? ` · due ${formatDateTime(task.dueDate)}` : ""}
                  </div>
                  <form action={updateTaskAction} className="inline-form mt-1">
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="taskId" value={task.id} />
                    <label className="sr-only" htmlFor={`status-${task.id}`}>Status</label>
                    <select className="select" id={`status-${task.id}`} name="status" defaultValue={task.status} style={{ minHeight: 36, width: 130 }}>
                      <option value="todo">To do</option>
                      <option value="doing">Doing</option>
                      <option value="done">Done</option>
                    </select>
                    <SubmitButton className="btn btn-secondary btn-sm">Update</SubmitButton>
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2 style={{ fontSize: "1.2rem" }}>Milestones</h2>
          {isLead ? (
            <form action={createMilestoneAction} className="stack" style={{ marginBottom: 16 }}>
              <input type="hidden" name="projectId" value={project.id} />
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="milestone-title">New milestone</label>
                <input className="input" id="milestone-title" name="title" required maxLength={160} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="milestone-due">Due date</label>
                <input className="input" id="milestone-due" name="dueDate" type="date" />
              </div>
              <SubmitButton className="btn btn-secondary btn-sm">Add milestone</SubmitButton>
            </form>
          ) : null}
          {workspace.milestones.length === 0 ? (
            <p className="small muted">No milestones yet.</p>
          ) : (
            <div className="stack">
              {workspace.milestones.map((milestone) => (
                <div key={milestone.id} className="spread" style={{ gap: 8 }}>
                  <div>
                    <div className="small" style={{ textDecoration: milestone.completedAt ? "line-through" : "none" }}>
                      {milestone.title}
                    </div>
                    <div className="tiny muted">
                      {milestone.dueDate ? `Due ${formatDateTime(milestone.dueDate)}` : "No due date"}
                      {milestone.completedAt ? ` · done ${formatDateTime(milestone.completedAt)}` : ""}
                    </div>
                  </div>
                  {isLead ? (
                    <form action={toggleMilestoneAction}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="milestoneId" value={milestone.id} />
                      <input type="hidden" name="completed" value={milestone.completedAt ? "false" : "true"} />
                      <SubmitButton className="btn btn-ghost btn-sm">
                        {milestone.completedAt ? "Reopen" : "Complete"}
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2 style={{ fontSize: "1.2rem" }}>Project updates</h2>
          {isLead ? (
            <form action={postProjectUpdateAction} className="stack" style={{ marginBottom: 16 }}>
              <input type="hidden" name="projectId" value={project.id} />
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="update-title">Title</label>
                <input className="input" id="update-title" name="title" required maxLength={160} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="update-body">Update</label>
                <textarea className="textarea" id="update-body" name="body" required minLength={10} maxLength={6000} rows={3} />
              </div>
              <SubmitButton className="btn btn-secondary btn-sm">Publish update</SubmitButton>
            </form>
          ) : null}
          {project.updates.length === 0 ? (
            <p className="small muted">No updates published yet.</p>
          ) : (
            <ol className="timeline">
              {project.updates.map((update) => (
                <li key={update.id}>
                  <div className="small"><strong>{update.title}</strong></div>
                  <div className="tiny muted">{formatDateTime(update.createdAt)}</div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {isLead ? (
        <section className="section">
          <div className="section-head">
            <h2 style={{ fontSize: "1.5rem" }}>Edit project</h2>
            <span className="small muted">Changes are audited.</span>
          </div>
          <form action={updateProjectAction} className="card">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="field">
              <label htmlFor="title">Title</label>
              <input className="input" id="title" name="title" defaultValue={project.title} maxLength={160} />
            </div>
            <div className="field">
              <label htmlFor="summary">Summary</label>
              <input className="input" id="summary" name="summary" defaultValue={project.summary} maxLength={300} />
            </div>
            <div className="field">
              <label htmlFor="description">Description</label>
              <textarea className="textarea" id="description" name="description" defaultValue={project.description} rows={6} maxLength={12000} />
            </div>
            <div className="form-grid two">
              <div className="field">
                <label htmlFor="category">Category</label>
                <select className="select" id="category" name="category" defaultValue={project.category}>
                  {PROJECT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>{categoryLabel(category)}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="clubId">Club</label>
                <select className="select" id="clubId" name="clubId" defaultValue={project.club?.id ?? ""}>
                  <option value="">No club</option>
                  {clubs.map((club) => (
                    <option key={club.id} value={club.id}>{club.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-grid two">
              <div className="field">
                <label htmlFor="goals">Goals</label>
                <textarea className="textarea" id="goals" name="goals" defaultValue={project.goals ?? ""} rows={3} maxLength={2000} />
              </div>
              <div className="field">
                <label htmlFor="expectedImpact">Expected impact</label>
                <textarea className="textarea" id="expectedImpact" name="expectedImpact" defaultValue={project.expectedImpact ?? ""} rows={3} maxLength={2000} />
              </div>
            </div>
            <div className="form-grid two">
              <div className="field">
                <label htmlFor="timeline">Timeline</label>
                <input className="input" id="timeline" name="timeline" defaultValue={project.timeline ?? ""} maxLength={500} />
              </div>
              <div className="field">
                <label htmlFor="resources">Resources</label>
                <input className="input" id="resources" name="resources" defaultValue={project.resources ?? ""} maxLength={1000} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="visibility">Visibility</label>
              <select className="select" id="visibility" name="visibility" defaultValue={project.visibility}>
                <option value="public">Public</option>
                <option value="members">Members only</option>
              </select>
            </div>
            <SubmitButton className="btn btn-primary">Save changes</SubmitButton>
          </form>
        </section>
      ) : null}
    </div>
  );
}
