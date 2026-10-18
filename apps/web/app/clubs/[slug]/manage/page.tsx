import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CLUB_CATEGORIES } from "@campussphere/contracts";
import {
  clubRoleFor,
  getClubBySlug,
  isClubOfficer,
  listClubApplications,
  listClubMembers,
} from "@campussphere/core";
import { requireUser } from "@/lib/session";
import { formatDate, formatDateTime, categoryLabel } from "@/lib/format";
import { Notice, Tag } from "@/components/Pieces";
import { SubmitButton } from "@/components/SubmitButton";
import {
  announceAction,
  changeRoleAction,
  decideMembershipAction,
  updateClubAction,
} from "@/app/actions/clubs";

export const metadata: Metadata = { title: "Manage club", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const policies = [
  { value: "open", label: "Open — join instantly" },
  { value: "request", label: "Request — officer review" },
  { value: "invite", label: "Invite only" },
];

export default async function ManageClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const messages = await searchParams;
  const me = await requireUser(`/clubs/${slug}/manage`);

  const club = await getClubBySlug(slug, me).catch(() => notFound());
  const [role, officer] = await Promise.all([clubRoleFor(club.id, me.id), isClubOfficer(club.id, me.id)]);
  if (!officer) redirect(`/clubs/${slug}?denied=manage`);

  const [applications, members] = await Promise.all([
    listClubApplications(club.id, me),
    listClubMembers(club.id),
  ]);
  const isPresident = role === "president" || me.roles.includes("super_admin");
  const canManageRoles = isPresident;
  const counts = {
    members: members.length,
    officers: members.filter((member) => member.role !== "member").length,
    pending: applications.length,
  };

  return (
    <div className="shell">
      {messages.ok ? <Notice>{messages.ok}</Notice> : null}
      {messages.error ? <Notice tone="danger">{messages.error}</Notice> : null}

      <div className="page-head">
        <p className="eyebrow">Officer tools</p>
        <div className="spread">
          <h1 style={{ marginBottom: 0 }}>{club.name}</h1>
          <div className="tag-row">
            <Tag tone="forest">{role ?? "officer"}</Tag>
            <Link className="small" href={`/clubs/${club.slug}`}>View public page</Link>
          </div>
        </div>
        <p className="lede">
          {counts.members} member{counts.members === 1 ? "" : "s"} · {counts.officers} officer
          {counts.officers === 1 ? "" : "s"} · {counts.pending} pending request{counts.pending === 1 ? "" : "s"}
        </p>
      </div>

      {!isPresident ? (
        <Notice tone="neutral">
          You are an officer. You can post announcements and review membership requests; changing roles and
          editing the public profile belongs to the president.
        </Notice>
      ) : null}

      <section className="card">
        <div className="spread">
          <h2 style={{ fontSize: "1.3rem", margin: 0 }}>Membership requests</h2>
          <span className="small muted">{applications.length} waiting</span>
        </div>
        {applications.length === 0 ? (
          <p className="small muted" style={{ marginTop: 10 }}>No pending requests right now.</p>
        ) : (
          <div className="stack-lg mt-2">
            {applications.map((application) => (
              <div key={application.id} className="card card-flat" style={{ background: "var(--paper)" }}>
                <div className="spread">
                  <div>
                    <strong>{application.user.name}</strong>
                    <p className="small muted" style={{ margin: "2px 0" }}>asked {formatDateTime(application.createdAt)}</p>
                  </div>
                  <Tag>Pending</Tag>
                </div>
                {application.message ? (
                  <blockquote className="small" style={{ margin: "8px 0", paddingLeft: 12, borderLeft: "2px solid var(--line)" }}>
                    {application.message}
                  </blockquote>
                ) : null}
                <div className="row mt-2">
                  <form action={decideMembershipAction} className="inline-form">
                    <input type="hidden" name="slug" value={club.slug} />
                    <input type="hidden" name="clubId" value={club.id} />
                    <input type="hidden" name="membershipId" value={application.id} />
                    <input type="hidden" name="status" value="active" />
                    <input type="hidden" name="role" value="member" />
                    <SubmitButton className="btn btn-primary btn-sm">Approve</SubmitButton>
                  </form>
                  {canManageRoles ? (
                    <form action={decideMembershipAction} className="inline-form">
                      <input type="hidden" name="slug" value={club.slug} />
                      <input type="hidden" name="clubId" value={club.id} />
                      <input type="hidden" name="membershipId" value={application.id} />
                      <input type="hidden" name="status" value="active" />
                      <input type="hidden" name="role" value="officer" />
                      <SubmitButton className="btn btn-secondary btn-sm">Approve as officer</SubmitButton>
                    </form>
                  ) : null}
                  <form action={decideMembershipAction} className="inline-form">
                    <input type="hidden" name="slug" value={club.slug} />
                    <input type="hidden" name="clubId" value={club.id} />
                    <input type="hidden" name="membershipId" value={application.id} />
                    <input type="hidden" name="status" value="rejected" />
                    <SubmitButton className="btn btn-danger btn-sm" confirm="Decline this request?">Decline</SubmitButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card mt-3">
        <h2 style={{ fontSize: "1.3rem" }}>Announce an update to members</h2>
        <p className="small muted">Announcements appear on the public club page, newest first. Pinned posts stay on top.</p>
        <form action={announceAction} className="mt-2">
          <input type="hidden" name="slug" value={club.slug} />
          <input type="hidden" name="clubId" value={club.id} />
          <div className="field">
            <label htmlFor="title">Title</label>
            <input className="input" id="title" name="title" required minLength={3} maxLength={140} />
          </div>
          <div className="field">
            <label htmlFor="body">Body</label>
            <textarea className="textarea" id="body" name="body" rows={4} required minLength={3} maxLength={5000} />
          </div>
          <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <input type="checkbox" name="pinned" value="true" />
            Pin to the top
          </label>
          <SubmitButton className="btn btn-primary">Publish announcement</SubmitButton>
        </form>
      </section>

      <section className="card mt-3">
        <h2 style={{ fontSize: "1.3rem" }}>Members ({members.length})</h2>
        <div className="table-wrap mt-2">
          <table className="data">
            <thead><tr><th>Name</th><th>Role</th><th>Joined</th>{canManageRoles ? <th>Change role</th> : null}</tr></thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.userId}>
                  <td>{member.name}{member.userId === me.id ? <span className="tiny muted"> (you)</span> : null}</td>
                  <td><Tag tone={member.role === "president" ? "forest" : undefined}>{member.role}</Tag></td>
                  <td className="small">{formatDate(member.joinedAt)}</td>
                  {canManageRoles ? (
                    <td>
                      <form action={changeRoleAction} className="inline-form">
                        <input type="hidden" name="slug" value={club.slug} />
                        <input type="hidden" name="clubId" value={club.id} />
                        <input type="hidden" name="userId" value={member.userId} />
                        <select className="select" name="role" defaultValue={member.role} aria-label={`Role for ${member.name}`}>
                          <option value="member">Member</option>
                          <option value="officer">Officer</option>
                          <option value="president">President</option>
                        </select>
                        <SubmitButton className="btn btn-secondary btn-sm" confirm="Presidency is a handover: the current president becomes an officer. Continue?">
                          Save
                        </SubmitButton>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint mt-2">
          Only one president exists at a time. Promoting someone to president hands over the role instead of
          creating a second one, and every change is audited.
        </p>
      </section>

      {isPresident ? (
        <section className="card mt-3">
          <h2 style={{ fontSize: "1.3rem" }}>Public profile</h2>
          <form action={updateClubAction} className="mt-2">
            <input type="hidden" name="slug" value={club.slug} />
            <input type="hidden" name="clubId" value={club.id} />
            <div className="form-grid two">
              <div className="field">
                <label htmlFor="name">Name</label>
                <input className="input" id="name" name="name" defaultValue={club.name} required minLength={2} maxLength={120} />
              </div>
              <div className="field">
                <label htmlFor="category">Category</label>
                <select className="select" id="category" name="category" defaultValue={club.category}>
                  {CLUB_CATEGORIES.map((category) => (
                    <option key={category} value={category}>{categoryLabel(category)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="tagline">Tagline</label>
              <input className="input" id="tagline" name="tagline" defaultValue={club.tagline ?? ""} maxLength={160} />
            </div>
            <div className="field">
              <label htmlFor="description">Description</label>
              <textarea className="textarea" id="description" name="description" defaultValue={club.description} rows={6} required minLength={20} maxLength={8000} />
            </div>
            <div className="form-grid two">
              <div className="field">
                <label htmlFor="membershipPolicy">Membership policy</label>
                <select className="select" id="membershipPolicy" name="membershipPolicy" defaultValue={club.membershipPolicy}>
                  {policies.map((policy) => (
                    <option key={policy.value} value={policy.value}>{policy.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="contactEmail">Contact email</label>
                <input className="input" id="contactEmail" name="contactEmail" type="email" defaultValue={club.contactEmail ?? ""} />
              </div>
            </div>
            <div className="form-grid two">
              <div className="field">
                <label htmlFor="websiteUrl">Website</label>
                <input className="input" id="websiteUrl" name="websiteUrl" type="url" defaultValue={club.websiteUrl ?? ""} placeholder="https://" />
              </div>
              <div className="field">
                <label htmlFor="instagramUrl">Instagram</label>
                <input className="input" id="instagramUrl" name="instagramUrl" type="url" defaultValue={club.instagramUrl ?? ""} placeholder="https://instagram.com/" />
              </div>
            </div>
            <div className="form-grid two">
              <div className="field">
                <label htmlFor="logoUrl">Logo URL</label>
                <input className="input" id="logoUrl" name="logoUrl" type="url" defaultValue={club.logoUrl ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="coverUrl">Cover URL</label>
                <input className="input" id="coverUrl" name="coverUrl" type="url" defaultValue={club.coverUrl ?? ""} />
              </div>
            </div>
            <SubmitButton className="btn btn-primary">Save profile</SubmitButton>
          </form>
        </section>
      ) : null}
    </div>
  );
}
