import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { Notice } from "@/components/Pieces";
import { requestDeletionAction, updateProfileAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata: Metadata = { title: "Your profile", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const messages = await searchParams;
  const me = await currentUser();
  if (!me) redirect("/login?next=/dashboard/profile");

  return (
    <div className="shell" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <p className="eyebrow">Account</p>
        <h1>Your profile</h1>
        <p className="lede">This is how your name appears on applications, project teams and announcements.</p>
      </div>
      {messages.ok ? <Notice>{messages.ok}</Notice> : null}
      {messages.error ? <Notice tone="danger">{messages.error}</Notice> : null}

      <div className="card">
        <h2 style={{ fontSize: "1.2rem" }}>Details</h2>
        <form action={updateProfileAction}>
          <div className="field">
            <label htmlFor="name">Display name</label>
            <input className="input" id="name" name="name" defaultValue={me.name} required maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="bio">Short bio <span className="hint">(shown on project pages)</span></label>
            <textarea className="textarea" id="bio" name="bio" defaultValue={me.bio ?? ""} maxLength={600} rows={4} />
          </div>
          <p className="hint">Email: {me.email} {me.emailVerified ? "· verified by provider" : "· unverified"}</p>
          <SubmitButton className="btn btn-primary">Save profile</SubmitButton>
        </form>
      </div>

      <div className="card mt-2">
        <h2 style={{ fontSize: "1.2rem" }}>Your data</h2>
        <p className="small muted">
          Download everything tied to your account as JSON. The export is generated on the server and
          streams to your browser; it is rate-limited and logged in the audit trail.
        </p>
        <a className="btn btn-secondary" href="/api/me/export">Download my data</a>
      </div>

      <div className="card mt-2" style={{ borderColor: "#e7c3bb" }}>
        <h2 style={{ fontSize: "1.2rem", color: "var(--danger)" }}>Delete your account</h2>
        <p className="small">
          This anonymises your account immediately and signs you out everywhere. Your posts and
          registrations stay in place without your name so club history stays coherent; administrative
          audit records are retained for accountability.
        </p>
        <form action={requestDeletionAction}>
          <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <input type="checkbox" name="confirm" required />
            I understand this cannot be undone.
          </label>
          <SubmitButton className="btn btn-danger" confirm="Anonymise and sign out everywhere?">
            Delete my account
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
