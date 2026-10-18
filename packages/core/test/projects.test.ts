import { describe, expect, it } from "vitest";
import { makeAdmin, makeClub, makeUser, resetDb } from "./helpers";
import {
  applyToProject,
  createProject,
  decideApplication,
  decideProject,
  getProjectBySlug,
  getProjectWorkspace,
  listProjectApplications,
  listProjects,
  updateProject,
} from "../src/services/projects";

const proposal = {
  title: "Solar bench for the engineering courtyard",
  summary: "A student-built bench that charges phones from a small solar array.",
  description:
    "We will design, prototype and install a solar-powered bench in the engineering courtyard. " +
    "The project covers electronics, carpentry and a small maintenance guide for the facilities team.",
  category: "campus-improvement" as const,
  roles: [{ title: "Electronics builder", description: "Wiring and testing", slots: 1 }],
  submit: true,
};

describe("project proposals and workspace", () => {
  it("requires super-admin approval before public listing", async () => {
    await resetDb();
    const lead = await makeUser();
    const created = await createProject(lead, { ...proposal, clubId: null });
    expect(created.status).toBe("submitted");

    const before = await listProjects({});
    expect(before.items).toHaveLength(0);

    const admin = await makeAdmin();
    await expect(decideProject(created.id, lead, "approve")).rejects.toMatchObject({ code: "forbidden" });
    await decideProject(created.id, admin, "approve", "Looks great for the pilot.");

    const after = await listProjects({});
    expect(after.items.map((item) => item.slug)).toContain(created.slug);
    const detail = await getProjectBySlug(created.slug, null);
    expect(detail.lead.id).toBe(lead.id);
  });

  it("records review notes when requesting changes", async () => {
    await resetDb();
    const admin = await makeAdmin();
    const lead = await makeUser();
    const created = await createProject(lead, proposal);
    await decideProject(created.id, admin, "request_changes", "Add a budget and a maintenance plan.");
    const detail = await getProjectBySlug(created.slug, lead);
    expect(detail.status).toBe("changes_requested");
    await updateProject(created.id, lead, { submit: true });
    await expect(updateProject(created.id, lead, { submit: true })).rejects.toMatchObject({ code: "conflict" });
  });

  it("lets the lead accept an application into a role with one slot", async () => {
    await resetDb();
    const admin = await makeAdmin();
    const lead = await makeUser({ name: "Lead" });
    const created = await createProject(lead, proposal);
    await decideProject(created.id, admin, "approve", "Approved.");
    const detail = await getProjectBySlug(created.slug, lead);
    const role = detail.roles[0]!;

    const first = await makeUser({ name: "First applicant" });
    const second = await makeUser({ name: "Second applicant" });
    const app1 = await applyToProject(created.id, first, { roleId: role.id, message: "I can solder and test the wiring." });
    await expect(
      applyToProject(created.id, first, { roleId: role.id, message: "Applying twice should fail." }),
    ).rejects.toMatchObject({ code: "conflict" });
    await applyToProject(created.id, second, { roleId: role.id, message: "I have woodworking experience." });

    await expect(decideApplication(created.id, app1.id, first, { decision: "accepted" })).rejects.toMatchObject({
      code: "forbidden",
    });
    await decideApplication(created.id, app1.id, lead, { decision: "accepted" });

    const applications = await listProjectApplications(created.id, lead);
    const secondApp = applications.find((application) => application.user.id === second.id)!;
    await expect(
      decideApplication(created.id, secondApp.id, lead, { decision: "accepted" }),
    ).rejects.toMatchObject({ code: "conflict" });

    const workspace = await getProjectWorkspace(created.id, lead);
    expect(workspace.members).toHaveLength(2);
    expect(workspace.members.map((member) => member.role).sort()).toEqual(["lead", "member"]);
  });

  it("hides unapproved projects from anonymous visitors", async () => {
    await resetDb();
    const lead = await makeUser();
    const created = await createProject(lead, proposal);
    await expect(getProjectBySlug(created.slug, null)).rejects.toMatchObject({ code: "not_found" });
  });

  it("keeps members-only projects out of the public list", async () => {
    await resetDb();
    const admin = await makeAdmin();
    const lead = await makeUser();
    const created = await createProject(lead, { ...proposal, visibility: "members" });
    await decideProject(created.id, admin, "approve", "Approved, internal only.");
    const list = await listProjects({});
    expect(list.items.some((item) => item.id === created.id)).toBe(false);
  });
});
