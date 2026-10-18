import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PROJECT_CATEGORIES } from "@campussphere/contracts";
import { categoryLabel } from "@/lib/format";
import { clubsWhereOfficer } from "@campussphere/core";
import { currentUser } from "@/lib/session";
import { Notice } from "@/components/Pieces";
import { createProjectAction } from "@/app/actions/projects";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata: Metadata = { title: "Propose a project", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const messages = await searchParams;
  const me = await currentUser();
  if (!me) redirect("/login?next=/dashboard/projects/new");
  const clubs = await clubsWhereOfficer(me.id);

  return (
    <div className="shell" style={{ maxWidth: 820 }}>
      <div className="page-head">
        <p className="eyebrow">Proposal</p>
        <h1>Propose a project</h1>
        <p className="lede">
          A super-admin reviews every proposal. You can save a draft, come back, and submit when it is
          ready — nothing appears publicly before approval.
        </p>
      </div>
      {messages.error ? <Notice tone="danger">{messages.error}</Notice> : null}

      <form action={createProjectAction} className="card">
        <div className="field">
          <label htmlFor="title">Project title</label>
          <input className="input" id="title" name="title" required minLength={3} maxLength={160} />
        </div>
        <div className="field">
          <label htmlFor="summary">One-line summary</label>
          <input className="input" id="summary" name="summary" required minLength={20} maxLength={300} />
        </div>
        <div className="field">
          <label htmlFor="description">What will you build or do?</label>
          <textarea className="textarea" id="description" name="description" required minLength={40} maxLength={12000} rows={7} />
          <span className="hint">Include the problem, your approach and who benefits.</span>
        </div>
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="category">Category</label>
            <select className="select" id="category" name="category" required defaultValue="software">
              {PROJECT_CATEGORIES.map((category) => (
                <option key={category} value={category}>{categoryLabel(category)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="clubId">Run by a club? <span className="hint">(optional)</span></label>
            <select className="select" id="clubId" name="clubId" defaultValue="">
              <option value="">Personal / no club</option>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>{club.name} ({club.role})</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="goals">Goals <span className="hint">(optional)</span></label>
          <textarea className="textarea" id="goals" name="goals" rows={3} maxLength={2000} />
        </div>
        <div className="field">
          <label htmlFor="expectedImpact">Expected impact <span className="hint">(optional)</span></label>
          <textarea className="textarea" id="expectedImpact" name="expectedImpact" rows={3} maxLength={2000} />
        </div>
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="timeline">Timeline <span className="hint">(optional)</span></label>
            <input className="input" id="timeline" name="timeline" maxLength={500} placeholder="e.g. 8 weeks, starting November" />
          </div>
          <div className="field">
            <label htmlFor="resources">Resources / budget <span className="hint">(optional)</span></label>
            <input className="input" id="resources" name="resources" maxLength={1000} placeholder="e.g. €150 for sensors" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="visibility">Visibility once approved</label>
          <select className="select" id="visibility" name="visibility" defaultValue="public">
            <option value="public">Public — discoverable by anyone</option>
            <option value="members">Members only — team access</option>
          </select>
        </div>

        <fieldset style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 16, margin: "0 0 16px" }}>
          <legend className="small" style={{ padding: "0 6px", fontWeight: 600 }}>Open roles</legend>
          <p className="hint" style={{ marginTop: 0 }}>Add up to three roles now; you can add more later in the workspace.</p>
          {[0, 1, 2].map((index) => (
            <div className="form-grid two" key={index}>
              <div className="field">
                <label htmlFor={`roleTitle-${index}`}>Role {index + 1} title</label>
                <input className="input" id={`roleTitle-${index}`} name="roleTitle" maxLength={100} placeholder={index === 0 ? "e.g. Electronics builder" : ""} />
              </div>
              <div className="field">
                <label htmlFor={`roleSlots-${index}`}>Places</label>
                <input className="input" id={`roleSlots-${index}`} name="roleSlots" type="number" min={1} max={20} defaultValue={1} />
              </div>
            </div>
          ))}
        </fieldset>

        <div className="row">
          <SubmitButton className="btn btn-primary" pendingLabel="Saving…" name="intent" value="draft">Save draft</SubmitButton>
          <SubmitButton className="btn btn-secondary" pendingLabel="Submitting…" name="intent" value="submit">Submit for review</SubmitButton>
        </div>
        <p className="tiny muted mt-1">
          &ldquo;Save draft&rdquo; keeps it private. &ldquo;Submit for review&rdquo; puts it in the super-admin
          queue; you can keep editing until a decision is made.
        </p>
      </form>
    </div>
  );
}
