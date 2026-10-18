import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectBySlug } from "@campussphere/core";
import { currentUser } from "@/lib/session";
import { categoryLabel, formatDateTime } from "@/lib/format";
import { Avatar, Notice, Tag } from "@/components/Pieces";
import { applyToProjectAction, withdrawApplicationAction } from "@/app/actions/projects";
import { reportAction } from "@/app/actions/moderation";
import { SubmitButton } from "@/components/SubmitButton";
import { breadcrumbJsonLd, jsonLdString, projectJsonLd } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const project = await getProjectBySlug(slug, null);
    return {
      title: project.title,
      description: project.summary,
      alternates: { canonical: `/projects/${project.slug}` },
      openGraph: {
        type: "article",
        title: project.title,
        description: project.summary,
        url: `/projects/${project.slug}`,
        ...(project.coverUrl ? { images: [{ url: project.coverUrl, alt: project.title }] } : {}),
      },
      twitter: { card: "summary_large_image", title: project.title, description: project.summary },
    };
  } catch {
    return { title: "Project not found" };
  }
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const messages = await searchParams;
  const me = await currentUser();
  let project;
  try {
    project = await getProjectBySlug(slug, me);
  } catch {
    notFound();
  }

  const isMember = Boolean(me && project.members.some((member) => member.userId === me.id));
  const isLead = Boolean(me && project.lead.id === me.id);
  const isPublic = project.status === "approved" && project.visibility === "public";
  const myApplication = project.myApplication;

  const structured = [
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Projects", path: "/projects" },
      { name: project.title, path: `/projects/${project.slug}` },
    ]),
    projectJsonLd(project),
  ];

  return (
    <div className="shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(structured) }} />
      <div className="page-head">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/projects">Projects</Link> <span aria-hidden="true">/</span> <span>{project.title}</span>
        </nav>
        <div className="tag-row" style={{ marginBottom: 10 }}>
          <Tag>{categoryLabel(project.category)}</Tag>
          {project.club ? (
            <Link className="tag tag-forest" href={`/clubs/${project.club.slug}`}>
              {project.club.name}
            </Link>
          ) : null}
          {project.status !== "approved" ? <Tag tone="marigold">{project.status.replace("_", " ")}</Tag> : null}
          {project.visibility === "members" ? <Tag>Members only</Tag> : null}
        </div>
        {project.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="cover-banner" src={project.coverUrl} alt="" width={1200} height={375} decoding="async" />
        ) : null}
        <h1>{project.title}</h1>
        <p className="lede">{project.summary}</p>
      </div>

      {messages.ok ? <Notice>{messages.ok}</Notice> : null}
      {messages.error ? <Notice tone="danger">{messages.error}</Notice> : null}

      <div className="split">
        <div>
          <div className="card">
            <h2 style={{ fontSize: "1.3rem" }}>The project</h2>
            <div className="prose">{project.description}</div>
            {project.goals ? (
              <>
                <hr />
                <h2 style={{ fontSize: "1.15rem" }}>Goals</h2>
                <p className="prose">{project.goals}</p>
              </>
            ) : null}
            {project.expectedImpact ? (
              <>
                <h2 style={{ fontSize: "1.15rem" }}>Expected impact</h2>
                <p className="prose">{project.expectedImpact}</p>
              </>
            ) : null}
            {project.timeline || project.resources ? (
              <>
                <hr />
                <div className="grid-2">
                  {project.timeline ? (
                    <div>
                      <h2 style={{ fontSize: "1.05rem" }}>Timeline</h2>
                      <p className="prose small">{project.timeline}</p>
                    </div>
                  ) : null}
                  {project.resources ? (
                    <div>
                      <h2 style={{ fontSize: "1.05rem" }}>Resources needed</h2>
                      <p className="prose small">{project.resources}</p>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          {project.updates.length > 0 ? (
            <section className="section" style={{ paddingTop: 26 }}>
              <div className="section-head">
                <h2 style={{ fontSize: "1.5rem" }}>Project updates</h2>
              </div>
              <ol className="timeline">
                {project.updates.map((update) => (
                  <li key={update.id}>
                    <h3 style={{ fontSize: "1rem", marginBottom: 2 }}>{update.title}</h3>
                    <p className="tiny muted" style={{ marginBottom: 6 }}>
                      {update.author.name} · {formatDateTime(update.createdAt)}
                    </p>
                    <p className="small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{update.body}</p>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>

        <aside className="sidebar">
          <div className="card">
            <h2 style={{ fontSize: "1.15rem" }}>Team</h2>
            <div className="member-row">
              <Avatar name={project.lead.name} src={project.lead.avatarUrl} />
              <div>
                <div className="small">{project.lead.name}</div>
                <div className="tiny muted">Project lead</div>
              </div>
            </div>
            {project.members.filter((member) => member.role !== "lead").map((member) => (
              <div className="member-row" key={member.userId}>
                <Avatar name={member.name} src={member.avatarUrl} />
                <div>
                  <div className="small">{member.name}</div>
                  <div className="tiny muted">Member</div>
                </div>
              </div>
            ))}
            <p className="tiny muted" style={{ marginTop: 8 }}>
              {project.members.length} on the team
            </p>
          </div>

          {project.roles.length > 0 ? (
            <div className="card">
              <h2 style={{ fontSize: "1.15rem" }}>Open roles</h2>
              {project.roles.map((role) => (
                <div key={role.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                  <div className="spread">
                    <strong className="small">{role.title}</strong>
                    <Tag tone={role.filled >= role.slots ? "danger" : "marigold"}>
                      {role.filled >= role.slots ? "Filled" : `${role.slots - role.filled} place${role.slots - role.filled === 1 ? "" : "s"} left`}
                    </Tag>
                  </div>
                  {role.description ? <p className="tiny muted" style={{ margin: "4px 0 0" }}>{role.description}</p> : null}
                </div>
              ))}
            </div>
          ) : null}

          <div className="card">
            {isLead ? (
              <Link className="btn btn-primary btn-block" href={`/dashboard/projects/${project.id}`}>
                Open workspace
              </Link>
            ) : isMember ? (
              <Link className="btn btn-secondary btn-block" href={`/dashboard/projects/${project.id}`}>
                Open workspace
              </Link>
            ) : !me ? (
              <Link className="btn btn-primary btn-block" href={`/login?next=/projects/${project.slug}`}>
                Sign in to apply
              </Link>
            ) : myApplication?.status === "pending" ? (
              <>
                <p className="small"><Tag tone="marigold">Application pending</Tag></p>
                <form action={withdrawApplicationAction}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="applicationId" value={myApplication.id} />
                  <input type="hidden" name="slug" value={project.slug} />
                  <SubmitButton className="btn btn-secondary btn-block">Withdraw application</SubmitButton>
                </form>
              </>
            ) : isPublic ? (
              <form action={applyToProjectAction}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="slug" value={project.slug} />
                <h2 style={{ fontSize: "1.15rem" }}>Apply to join</h2>
                {project.roles.length > 0 ? (
                  <div className="field">
                    <label htmlFor="roleId">Role</label>
                    <select className="select" id="roleId" name="roleId" defaultValue="">
                      <option value="">Any role / general application</option>
                      {project.roles.map((role) => (
                        <option key={role.id} value={role.id} disabled={role.filled >= role.slots}>
                          {role.title}{role.filled >= role.slots ? " (filled)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className="field">
                  <label htmlFor="message">Why you? What can you contribute?</label>
                  <textarea className="textarea" id="message" name="message" rows={4} required minLength={10} maxLength={1500} />
                </div>
                <SubmitButton className="btn btn-primary btn-block">Send application</SubmitButton>
              </form>
            ) : (
              <p className="small muted">This project is not open for applications.</p>
            )}
          </div>

          {me ? (
            <details>
              <summary className="small muted" style={{ cursor: "pointer" }}>Report a problem</summary>
              <form action={reportAction} className="card mt-1">
                <input type="hidden" name="targetType" value="project" />
                <input type="hidden" name="targetId" value={project.id} />
                <input type="hidden" name="returnTo" value={`/projects/${project.slug}`} />
                <div className="field">
                  <label htmlFor="reason">Reason</label>
                  <input className="input" id="reason" name="reason" maxLength={120} required />
                </div>
                <SubmitButton className="btn btn-secondary btn-sm">Send report</SubmitButton>
              </form>
            </details>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
