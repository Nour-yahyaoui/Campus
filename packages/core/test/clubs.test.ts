import { describe, expect, it } from "vitest";
import { addClubMember, makeAdmin, makeClub, makeUser, resetDb } from "./helpers";
import { changeMemberRole, decideMembership, getClubBySlug, joinClub, leaveClub, listClubApplications, requireClubAccess, updateClub } from "../src/services/clubs";

describe("clubs and object-level authorization", () => {
  it("supports request-based membership with an officer decision", async () => {
    await resetDb();
    const { club, admin } = await makeClub({ policy: "request" });
    const student = await makeUser();
    const joined = await joinClub(club.id, student);
    expect(joined.status).toBe("pending");

    const applications = await listClubApplications(club.id, admin);
    expect(applications).toHaveLength(1);
    await decideMembership(club.id, applications[0]!.id, admin, { status: "active" });
    const detail = await getClubBySlug(club.slug, student);
    expect(detail.membership?.status).toBe("active");
  });

  it("forbids editing another club by swapping the id", async () => {
    await resetDb();
    const clubA = await makeClub();
    const clubB = await makeClub();
    const outsider = await makeUser();
    await addClubMember(clubB.club.id, outsider.id, "president");

    await expect(
      updateClub(clubA.club.id, outsider, { description: "Hijacked description that is long enough." }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(requireClubAccess(clubA.club.id, outsider, "content")).rejects.toMatchObject({
      code: "forbidden",
    });
    // Their own club still works.
    await expect(
      updateClub(clubB.club.id, outsider, { description: "Legitimate update to the club they lead." }),
    ).resolves.toBeUndefined();
  });

  it("prevents duplicate active or pending memberships", async () => {
    await resetDb();
    const { club } = await makeClub({ policy: "request" });
    const student = await makeUser();
    await joinClub(club.id, student);
    await expect(joinClub(club.id, student)).rejects.toMatchObject({ code: "conflict" });
  });

  it("keeps a club from becoming leaderless", async () => {
    await resetDb();
    const { club, admin } = await makeClub();
    const president = admin; // creator became president in createClub
    await expect(leaveClub(club.id, president)).rejects.toMatchObject({ code: "conflict" });

    const successor = await makeUser();
    await addClubMember(club.id, successor.id, "member");
    await changeMemberRole(club.id, successor.id, president, "president");
    // Handover demotes the previous president rather than creating two.
    await expect(leaveClub(club.id, president)).resolves.toBeUndefined();
  });

  it("does not let a plain member grant roles", async () => {
    await resetDb();
    const { club } = await makeClub();
    const officer = await makeUser();
    await addClubMember(club.id, officer.id, "officer");
    const target = await makeUser();
    await addClubMember(club.id, target.id, "member");
    await expect(changeMemberRole(club.id, target.id, officer, "president")).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
