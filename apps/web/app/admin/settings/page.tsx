import type { Metadata } from "next";
import { getMaintenanceState, siteUrl } from "@campussphere/core";
import { requireSuperAdmin } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { Notice, Tag } from "@/components/Pieces";
import { maintenanceAction } from "@/app/actions/admin";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const messages = await searchParams;
  await requireSuperAdmin("/admin/settings");
  const maintenance = await getMaintenanceState();

  return (
    <>
      {messages.ok ? <Notice>{messages.ok}</Notice> : null}
      {messages.error ? <Notice tone="danger">{messages.error}</Notice> : null}

      <div className="card">
        <div className="spread">
          <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Maintenance mode</h2>
          <Tag tone={maintenance.enabled ? "danger" : "forest"}>{maintenance.enabled ? "On" : "Off"}</Tag>
        </div>
        <p className="small muted">
          Maintenance mode keeps public reading available but makes write actions fail with a clear 503.
          Use it during risky migrations, not as a substitute for backups.
        </p>
        {maintenance.updatedAt ? (
          <p className="tiny muted">
            Last changed {formatDateTime(maintenance.updatedAt)}
            {maintenance.message ? ` · “${maintenance.message}”` : ""}
          </p>
        ) : null}
        <form action={maintenanceAction}>
          <div className="field">
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="enabled" defaultChecked={maintenance.enabled} />
              Enable maintenance mode
            </label>
          </div>
          <div className="field">
            <label htmlFor="message">Public message</label>
            <input className="input" id="message" name="message" defaultValue={maintenance.message ?? ""} maxLength={500} />
          </div>
          <SubmitButton className="btn btn-primary">Save</SubmitButton>
        </form>
      </div>

      <div className="card mt-3">
        <h2 style={{ fontSize: "1.25rem" }}>Configuration held outside the database</h2>
        <dl className="fact-list">
          <div className="fact"><dt>Google sign-in</dt><dd>{process.env.GOOGLE_CLIENT_ID ? "Configured" : "Not configured"}</dd></div>
          <div className="fact"><dt>Email transport</dt><dd>{process.env.EMAIL_TRANSPORT ?? "console"} {process.env.EMAIL_TRANSPORT === "console" || !process.env.EMAIL_TRANSPORT ? "· logs only, no delivery" : ""}</dd></div>
          <div className="fact"><dt>Development sign-in</dt><dd>{process.env.ALLOW_DEV_SIGN_IN === "true" && process.env.NODE_ENV !== "production" ? "Enabled (non-production)" : "Disabled"}</dd></div>
          <div className="fact"><dt>Site URL</dt><dd>{siteUrl()}</dd></div>
        </dl>
        <p className="hint">These are environment variables; change them in the hosting dashboard, not here.</p>
      </div>
    </>
  );
}
