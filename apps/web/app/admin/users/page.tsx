import type { Metadata } from "next";
import { listUsers } from "@campussphere/core";
import { requireSuperAdmin } from "@/lib/session";
import { formatDateTime, formatRelative, titleCase } from "@/lib/format";
import { Notice, Tag } from "@/components/Pieces";
import { SearchBox } from "@/components/Filters";
import { setRolesAction, suspendAction } from "@/app/actions/admin";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata: Metadata = { title: "People", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; ok?: string; error?: string }>;
}) {
  const params = await searchParams;
  const me = await requireSuperAdmin("/admin/users");
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const limit = 25;
  const users = await listUsers(me, { q: params.q, limit, offset: (page - 1) * limit });

  return (
    <>
      {params.ok ? <Notice>{params.ok}</Notice> : null}
      {params.error ? <Notice tone="danger">{params.error}</Notice> : null}
      <div className="spread" style={{ margin: "10px 0 18px" }}>
        <h2 style={{ margin: 0, fontSize: "1.4rem" }}>People <span className="small muted">({users.total})</span></h2>
        <SearchBox action="/admin/users" defaultValue={params.q} placeholder="Name or email" />
      </div>

      <div className="stack-lg">
        {users.items.map((user) => (
          <article key={user.id} className="card">
            <div className="spread">
              <div>
                <h3 style={{ fontSize: "1.05rem", margin: 0 }}>{user.name}</h3>
                <p className="small muted" style={{ margin: "2px 0" }}>{user.email}</p>
                <div className="tag-row">
                  {user.roles.map((role) => <Tag key={role} tone={role === "super_admin" ? "forest" : undefined}>{role}</Tag>)}
                  <Tag tone={user.status === "active" ? undefined : "danger"}>{titleCase(user.status)}</Tag>
                  <Tag>joined {formatDateTime(user.createdAt)}</Tag>
                  <Tag>last seen {user.lastSeenAt ? formatRelative(user.lastSeenAt) : "never"}</Tag>
                </div>
              </div>
            </div>
            <div className="dash-grid mt-2">
              <form action={setRolesAction} className="stack" style={{ gap: 8 }}>
                <input type="hidden" name="userId" value={user.id} />
                <span className="label">Platform roles</span>
                <label className="small" style={{ display: "flex", gap: 8 }}>
                  <input type="checkbox" name="roles" value="moderator" defaultChecked={user.roles.includes("moderator")} />
                  Moderator
                </label>
                <label className="small" style={{ display: "flex", gap: 8 }}>
                  <input type="checkbox" name="roles" value="super_admin" defaultChecked={user.roles.includes("super_admin")} />
                  Super-admin
                </label>
                <SubmitButton className="btn btn-secondary btn-sm">Save roles</SubmitButton>
              </form>
              <form action={suspendAction} className="stack" style={{ gap: 8 }}>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="suspended" value={user.status === "active" ? "true" : "false"} />
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor={`reason-${user.id}`}>Reason (audited)</label>
                  <input className="input" id={`reason-${user.id}`} name="reason" required minLength={3} maxLength={500} />
                </div>
                <SubmitButton
                  className={user.status === "active" ? "btn btn-danger btn-sm" : "btn btn-primary btn-sm"}
                  confirm={user.status === "active" ? `Suspend ${user.name} and revoke sessions?` : undefined}
                >
                  {user.status === "active" ? "Suspend account" : "Reactivate account"}
                </SubmitButton>
              </form>
            </div>
          </article>
        ))}
      </div>

      <div className="row mt-3">
        {page > 1 ? <a className="btn btn-secondary btn-sm" href={`/admin/users?page=${page - 1}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`}>Previous</a> : null}
        {users.items.length === limit ? <a className="btn btn-secondary btn-sm" href={`/admin/users?page=${page + 1}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`}>Next</a> : null}
      </div>
    </>
  );
}
