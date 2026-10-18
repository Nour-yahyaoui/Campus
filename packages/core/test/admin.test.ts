import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../src/db";
import {
  adminOverview,
  bootstrapSuperAdmin,
  getMaintenanceState,
  listUsers,
  requireWritesEnabled,
  setMaintenanceState,
  setSuspension,
  setUserRoles,
} from "../src/services/admin";
import { listAudit } from "../src/audit";
import { resolveSession } from "../src/auth";
import { createReport, listReports, resolveReport } from "../src/services/moderation";
import { makeAdmin, makeClub, makeUser, resetDb, sessionFor } from "./helpers";

beforeEach(async () => {
  await resetDb();
});

describe("super-admin controls", () => {
  it("requires the super-admin role for people-management queries", async () => {
    const student = await makeUser();
    await expect(listUsers(student)).rejects.toMatchObject({ status: 403 });
  });

  it("refuses to let a super-admin edit their own roles or suspend themselves", async () => {
    const admin = await makeAdmin();
    await expect(setUserRoles(admin, admin.id, ["student"])).rejects.toMatchObject({ status: 409 });
    await expect(setSuspension(admin, admin.id, true, "nope")).rejects.toMatchObject({ status: 409 });
  });

  it("grants and revokes roles, and revokes sessions on admin removal", async () => {
    const admin = await makeAdmin();
    const other = await makeUser();
    const session = await sessionFor(other.id);
    await setUserRoles(admin, other.id, ["student", "moderator"]);
    const promoted = (await listUsers(admin)).items.find((user) => user.id === other.id)!;
    expect(promoted.roles).toEqual(["student", "moderator"]);

    await setUserRoles(admin, other.id, ["student"]);
    expect(await resolveSession(session.token)).not.toBeNull(); // not an admin change, session stays
    const secondAdmin = await makeAdmin();
    const adminSession = await sessionFor(secondAdmin.id);
    await setUserRoles(admin, secondAdmin.id, ["student"]);
    expect(await resolveSession(adminSession.token)).toBeNull();
  });

  it("revokes existing sessions when someone is suspended", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    const session = await sessionFor(target.id);
    expect(await resolveSession(session.token)).not.toBeNull();

    await setSuspension(admin, target.id, true, "Repeated harassment reports");
    expect(await resolveSession(session.token)).toBeNull();
    const current = await query<{ status: string }>("select status from users where id = $1", [target.id]);
    expect(current.rows[0]!.status).toBe("suspended");
  });

  it("records a suspension in the audit log with the reason", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    await setSuspension(admin, target.id, true, "Spam");
    const events = await listAudit({ limit: 10, actionPrefix: "user." });
    expect(events[0]).toMatchObject({ action: "user.suspended", entityId: target.id });
    expect(events[0]!.metadata).toMatchObject({ reason: "Spam" });
  });
});

describe("maintenance mode", () => {
  it("is stored transparently and turns writes off at the request boundary", async () => {
    const admin = await makeAdmin();
    await expect(requireWritesEnabled()).resolves.toBeUndefined();

    await setMaintenanceState(admin, { enabled: true, message: "Migrating the database" });
    expect(await getMaintenanceState()).toMatchObject({
      enabled: true,
      message: "Migrating the database",
    });
    await expect(requireWritesEnabled()).rejects.toMatchObject({ status: 503 });

    await setMaintenanceState(admin, { enabled: false, message: null });
    await expect(requireWritesEnabled()).resolves.toBeUndefined();
  });

  it("keeps reads working while maintenance is on", async () => {
    const admin = await makeAdmin();
    await setMaintenanceState(admin, { enabled: true });
    const { club } = await makeClub();
    const { getClubBySlug } = await import("../src/services/clubs");
    await expect(getClubBySlug(club.slug, null)).resolves.toMatchObject({ slug: club.slug });
    expect((await adminOverview(admin)).clubs).toBeGreaterThan(0);
  });
});

describe("moderation", () => {
  it("accepts a report, restricts the queue and records a resolution", async () => {
    const reporter = await makeUser();
    const moderator = await makeAdmin();
    const { club } = await makeClub();
    const created = await createReport(reporter, {
      targetType: "club",
      targetId: club.id,
      reason: "Impersonating an official university society",
      details: "The logo and name are copied from a real department page.",
    });
    await expect(listReports(reporter)).rejects.toMatchObject({ status: 403 });

    const queue = await listReports(moderator);
    expect(queue.find((item) => item.id === created.id)).toMatchObject({ status: "open" });

    await resolveReport(created.id, moderator, {
      status: "resolved",
      notes: "Club renamed after a conversation with the president.",
    });
    expect((await listReports(moderator)).find((item) => item.id === created.id)).toMatchObject({
      status: "resolved",
      resolutionNotes: "Club renamed after a conversation with the president.",
    });
    expect(await adminOverview(moderator)).toMatchObject({ openReports: 0 });
  });

  it("rejects a report about a target that does not exist", async () => {
    const reporter = await makeUser();
    await expect(
      createReport(reporter, {
        targetType: "project",
        targetId: "00000000-0000-4000-8000-000000000000",
        reason: "Does not exist but the form accepted it",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("audit log", () => {
  it("is append-only at the database level", async () => {
    const admin = await makeAdmin();
    await setSuspension(admin, (await makeUser()).id, true, "Testing the audit trail");
    await expect(query("update audit_events set action = 'tampered'")).rejects.toThrow();
    await expect(query("delete from audit_events")).rejects.toThrow();
  });
});

describe("super-admin bootstrap", () => {
  it("creates, is idempotent, de-duplicates the role and audits each run", async () => {
    const first = await bootstrapSuperAdmin("founder@campussphere.local");
    expect(first.created).toBe(true);

    const second = await bootstrapSuperAdmin("  Founder@CampusSphere.local ");
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);

    const roles = await query<{ roles: string }>("select roles::text as roles from users where id = $1", [first.id]);
    expect(roles.rows[0]!.roles).toBe("{student,super_admin}");

    const audit = await query<{ n: number }>(
      "select count(*)::int as n from audit_events where action = 'admin.bootstrap_superadmin'",
    );
    expect(audit.rows[0]!.n).toBe(2);

    await expect(bootstrapSuperAdmin("not-an-email")).rejects.toMatchObject({ status: 400 });
  });
});
