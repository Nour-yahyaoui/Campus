import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../src/db";
import { accountSummary, exportMyData, requestDeletion, updateProfile } from "../src/services/users";
import { searchAll } from "../src/services/search";
import { listNotifications, markAllRead, markRead, notify, unreadCount } from "../src/notifications";
import { makeAdmin, makeClub, makeUser, resetDb } from "./helpers";
import { createProject, decideProject } from "../src/services/projects";

beforeEach(async () => {
  await resetDb();
});

describe("profile and account lifecycle", () => {
  it("validates and updates a display name, keeping roles intact", async () => {
    const me = await makeUser({ name: "Old Name" });
    await updateProfile(me, { name: "New Name", bio: "Second-year mechatronics student." });
    const saved = await query<{ name: string; bio: string }>("select name, bio from users where id = $1", [me.id]);
    expect(saved.rows[0]).toMatchObject({ name: "New Name", bio: "Second-year mechatronics student." });
    expect(await accountSummary(me.id)).toMatchObject({ clubs: 0, projects: 0, events: 0 });
    await expect(updateProfile(me, { name: " " })).rejects.toBeTruthy();
  });

  it("exports only the requester's own data", async () => {
    const me = await makeUser();
    await makeUser();
    await makeClub();
    const exported = await exportMyData(me);
    expect(exported).toMatchObject({ account: expect.any(Object) });
    const text = JSON.stringify(exported);
    expect(text).toContain(me.email);
    expect(text).not.toContain("@example.edu\",\"name\":\"Test Student\",\"email\":\"" + me.email);
  });

  it("anonymises the account, revokes sessions and keeps the audit trail on deletion", async () => {
    const me = await makeUser();
    await updateProfile(me, { name: "Deletable Person" });
    const result = await requestDeletion(me);
    expect(result.retained.length).toBeGreaterThan(0);

    const row = await query<{ name: string; email: string; status: string }>(
      "select name, email, status from users where id = $1",
      [me.id],
    );
    expect(row.rows[0]!.status).toBe("deletion_requested");
    expect(row.rows[0]!.email).not.toContain("@example.edu");
    expect(row.rows[0]!.name).not.toBe("Deletable Person");

    const sessions = await query("select 1 from sessions where user_id = $1 and revoked_at is null", [me.id]);
    expect(sessions.rowCount).toBe(0);

    const audit = await query<{ n: number }>(
      "select count(*)::int as n from audit_events where action = 'user.deletion_requested' and entity_id = $1",
      [me.id],
    );
    expect(audit.rows[0]!.n).toBe(1);
  });
});

describe("notifications", () => {
  it("tracks unread counts and marks notifications read idempotently", async () => {
    const me = await makeUser();
    expect(await unreadCount(me.id)).toBe(0);

    await notify({ userId: me.id, kind: "system", title: "Welcome", body: "Say hello to your campus." });
    await notify({ userId: me.id, kind: "system", title: "Second", body: "Another note." });
    expect(await unreadCount(me.id)).toBe(2);

    const [first] = await listNotifications(me.id);
    await markRead(me.id, first!.id);
    expect(await unreadCount(me.id)).toBe(1);
    expect(await markAllRead(me.id)).toBe(1);
    expect(await unreadCount(me.id)).toBe(0);
  });
});

describe("search", () => {
  it("finds only public, approved content and scopes by type", async () => {
    const admin = await makeAdmin();
    const lead = await makeUser();
    const { club } = await makeClub({ name: "Underwater Robotics" });
    const draft = await createProject(lead, {
      title: "Underwater drone for the pool",
      summary: "A small ROV built with the robotics club to inspect the campus pool.",
      description:
        "We will build a tethered underwater drone with an accessible control box, test it in the pool and document the build.",
      category: "robotics",
      submit: true,
    });
    const approved = await createProject(lead, {
      title: "Underwater mapping workshop",
      summary: "A workshop on mapping pool floors with a simple ROV.",
      description:
        "A practical workshop covering sonar basics, pool safety and how to log a repeatable mapping run with the drone.",
      category: "robotics",
      submit: true,
    });
    await decideProject(approved.id, admin, "approve", "Approved for the pilot.");

    const all = await searchAll("underwater", "all");
    expect(all.clubs.map((item) => item.name)).toContain("Underwater Robotics");
    expect(all.projects.map((item) => item.title)).toContain("Underwater mapping workshop");
    expect(all.projects.map((item) => item.title)).not.toContain("Underwater drone for the pool");

    const projectsOnly = await searchAll("underwater", "projects");
    expect(projectsOnly.clubs).toEqual([]);
    expect(projectsOnly.events).toEqual([]);
    expect(draft.id).toBeTruthy();
    expect(club.slug).toBeTruthy();
  });

  it("treats short or empty queries as no query rather than scanning the database", async () => {
    const results = await searchAll("a", "all");
    expect(results).toMatchObject({ clubs: [], projects: [], events: [], total: 0 });
  });
});
