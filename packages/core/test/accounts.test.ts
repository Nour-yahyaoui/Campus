import { describe, expect, it } from "vitest";
import { addClubMember, makeAdmin, makeClub, makeUser, resetDb } from "./helpers";
import { query } from "../src/db";
import { exportMyData, requestDeletion } from "../src/services/users";

describe("account export and deletion", () => {
  it("exports everything tied to the person, not just the profile", async () => {
    await resetDb();
    const user = await makeUser();
    const exportBundle = await exportMyData(user);
    for (const key of [
      "account",
      "clubMemberships",
      "projectMemberships",
      "projectApplications",
      "eventRegistrations",
      "eventFeedback",
      "announcements",
      "projectUpdates",
      "assignedTasks",
      "uploadedMedia",
      "sessions",
      "auditTrail",
      "notifications",
    ]) {
      expect(exportBundle).toHaveProperty(key);
    }
    // Session rows are described, never handed out: the token hash is absent.
    const sessions = exportBundle.sessions as Array<Record<string, unknown>>;
    for (const row of sessions) expect(row).not.toHaveProperty("token_hash");
  });

  it("refuses deletion while the person is the last active super-admin", async () => {
    await resetDb();
    const admin = await makeAdmin();
    await expect(requestDeletion(admin)).rejects.toMatchObject({ code: "conflict" });
  });

  it("refuses deletion while the person is still a club president", async () => {
    await resetDb();
    const { club } = await makeClub();
    const president = await makeUser({ name: "President" });
    await addClubMember(club.id, president.id, "president");
    await expect(requestDeletion(president)).rejects.toMatchObject({ code: "conflict" });
  });

  it("anonymises the account, ends memberships and drops queued mail", async () => {
    await resetDb();
    const { club } = await makeClub();
    const member = await makeUser({ name: "Member", email: "leaver@example.edu" });
    await addClubMember(club.id, member.id, "member");
    await query(
      `insert into outbound_emails (recipient, subject, body, provider, status)
       values ($1, 'Welcome', 'Hi Member', 'console', 'sent')`,
      [member.email],
    );
    await query(`insert into jobs (kind, payload) values ('email', $1)`, [
      JSON.stringify({ to: member.email, subject: "Queued", text: "Hi" }),
    ]);

    await requestDeletion(member);

    const stored = await query<{ name: string; email: string; roles: string[]; google_sub: string | null }>(
      "select name, email, roles::text[] as roles, google_sub from users where id = $1",
      [member.id],
    );
    expect(stored.rows[0]).toMatchObject({ name: "Former member", google_sub: null });
    expect(stored.rows[0]!.email).not.toContain("leaver");
    expect(stored.rows[0]!.roles).toEqual(["student"]);

    const membership = await query<{ status: string }>(
      "select status from club_memberships where user_id = $1",
      [member.id],
    );
    expect(membership.rows[0]!.status).toBe("left");

    const emails = await query<{ recipient: string; body: string }>("select recipient, body from outbound_emails");
    expect(emails.rows[0]!.recipient).not.toContain("leaver");
    expect(emails.rows[0]!.body).not.toContain("Hi Member");

    const queued = await query<{ n: number }>("select count(*)::int as n from jobs");
    expect(queued.rows[0]!.n).toBe(0);
  });
});
