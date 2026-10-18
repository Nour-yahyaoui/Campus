import type { Metadata } from "next";
import Link from "next/link";
import { CLUB_CATEGORIES } from "@campussphere/contracts";
import { categoryLabel } from "@/lib/format";
import { adminListClubs } from "@campussphere/core";
import { requireSuperAdmin } from "@/lib/session";
import { Notice, Tag } from "@/components/Pieces";
import { createClubAction, verifyClubAction } from "@/app/actions/admin";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata: Metadata = { title: "Clubs", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminClubsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const messages = await searchParams;
  const me = await requireSuperAdmin("/admin/clubs");
  const clubs = await adminListClubs(me);

  return (
    <>
      {messages.ok ? <Notice>{messages.ok}</Notice> : null}
      {messages.error ? <Notice tone="danger">{messages.error}</Notice> : null}

      <div className="card">
        <h2 style={{ fontSize: "1.25rem" }}>Create a club</h2>
        <p className="small muted">You become its first president. Hand over leadership from the club&apos;s manage page.</p>
        <form action={createClubAction} className="mt-2">
          <div className="form-grid two">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input className="input" id="name" name="name" required minLength={2} maxLength={120} />
            </div>
            <div className="field">
              <label htmlFor="category">Category</label>
              <select className="select" id="category" name="category" defaultValue="technology">
                {CLUB_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{categoryLabel(category)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="tagline">Tagline</label>
            <input className="input" id="tagline" name="tagline" maxLength={160} />
          </div>
          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea className="textarea" id="description" name="description" required minLength={20} maxLength={8000} rows={4} />
          </div>
          <div className="field">
            <label htmlFor="membershipPolicy">Membership policy</label>
            <select className="select" id="membershipPolicy" name="membershipPolicy" defaultValue="request">
              <option value="open">Open — join instantly</option>
              <option value="request">Request — officer review</option>
              <option value="invite">Invite only</option>
            </select>
          </div>
          <SubmitButton className="btn btn-primary">Create club</SubmitButton>
        </form>
      </div>

      <div className="card mt-3">
        <h2 style={{ fontSize: "1.25rem" }}>All clubs ({clubs.length})</h2>
        {clubs.length === 0 ? (
          <p className="small muted">No clubs yet.</p>
        ) : (
          <div className="table-wrap mt-2">
            <table className="data">
              <thead><tr><th>Club</th><th>Category</th><th>Members</th><th>Verified</th><th></th></tr></thead>
              <tbody>
                {clubs.map((club) => (
                  <tr key={club.id}>
                    <td><Link href={`/clubs/${club.slug}`}>{club.name}</Link><div className="tiny muted">{club.slug}</div></td>
                    <td>{categoryLabel(club.category)}</td>
                    <td>{club.memberCount}</td>
                    <td>{club.verified ? <Tag tone="forest">Verified</Tag> : <Tag>Unverified</Tag>}</td>
                    <td>
                      <form action={verifyClubAction} className="inline-form">
                        <input type="hidden" name="clubId" value={club.id} />
                        <input type="hidden" name="verified" value={club.verified ? "false" : "true"} />
                        <SubmitButton className="btn btn-secondary btn-sm">
                          {club.verified ? "Remove verification" : "Verify"}
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
