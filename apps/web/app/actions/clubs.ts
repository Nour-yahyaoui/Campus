"use server";

import {
  announcementInput,
  clubJoinInput,
  clubMemberUpdateInput,
  clubUpdateInput,
} from "@campussphere/contracts";
import {
  changeMemberRole,
  createAnnouncement,
  decideMembership,
  joinClub,
  leaveClub,
  updateClub,
} from "@campussphere/core";
import { back, bool, errorMessage, isRedirect, nullable, opt, str } from "@/lib/forms";
import { requireUser } from "@/lib/session";
import { requireWritesEnabled } from "@campussphere/core";

export async function joinClubAction(formData: FormData): Promise<void> {
  const slug = str(formData, "slug");
  await requireWritesEnabled();
  const me = await requireUser(`/clubs/${slug}`);
  const parsed = clubJoinInput.safeParse({ message: nullable(formData, "message") });
  if (!parsed.success) back(`/clubs/${slug}`, { error: parsed.error.issues[0]?.message });
  try {
    const result = await joinClub(str(formData, "clubId"), me, parsed.data.message);
    back(`/clubs/${slug}`, {
      ok: result.status === "active" ? "You are now a member." : "Your request was sent to the club officers.",
    });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/clubs/${slug}`, { error: errorMessage(error) });
  }
}

export async function leaveClubAction(formData: FormData): Promise<void> {
  const slug = str(formData, "slug");
  await requireWritesEnabled();
  const me = await requireUser(`/clubs/${slug}`);
  try {
    await leaveClub(str(formData, "clubId"), me);
    back(`/clubs/${slug}`, { ok: "You left the club." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/clubs/${slug}`, { error: errorMessage(error) });
  }
}

export async function updateClubAction(formData: FormData): Promise<void> {
  const slug = str(formData, "slug");
  await requireWritesEnabled();
  const me = await requireUser(`/clubs/${slug}/manage`);
  const parsed = clubUpdateInput.safeParse({
    name: opt(formData, "name"),
    tagline: nullable(formData, "tagline"),
    description: opt(formData, "description"),
    category: opt(formData, "category"),
    websiteUrl: nullable(formData, "websiteUrl"),
    contactEmail: nullable(formData, "contactEmail"),
    instagramUrl: nullable(formData, "instagramUrl"),
    membershipPolicy: opt(formData, "membershipPolicy"),
  });
  if (!parsed.success) back(`/clubs/${slug}/manage`, { error: parsed.error.issues[0]?.message });
  try {
    await updateClub(str(formData, "clubId"), me, parsed.data);
    back(`/clubs/${slug}/manage`, { ok: "Club profile updated." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/clubs/${slug}/manage`, { error: errorMessage(error) });
  }
}

export async function decideMembershipAction(formData: FormData): Promise<void> {
  const slug = str(formData, "slug");
  await requireWritesEnabled();
  const me = await requireUser(`/clubs/${slug}/manage`);
  const parsed = clubMemberUpdateInput.safeParse({
    role: opt(formData, "role"),
    status: opt(formData, "status"),
  });
  if (!parsed.success) back(`/clubs/${slug}/manage`, { error: parsed.error.issues[0]?.message });
  try {
    await decideMembership(str(formData, "clubId"), str(formData, "membershipId"), me, {
      status: parsed.data.status === "rejected" ? "rejected" : "active",
      role: parsed.data.role,
    });
    back(`/clubs/${slug}/manage`, { ok: "Membership updated." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/clubs/${slug}/manage`, { error: errorMessage(error) });
  }
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const slug = str(formData, "slug");
  await requireWritesEnabled();
  const me = await requireUser(`/clubs/${slug}/manage`);
  const role = str(formData, "role");
  if (!["member", "officer", "president"].includes(role)) {
    back(`/clubs/${slug}/manage`, { error: "Pick a valid role." });
  }
  try {
    await changeMemberRole(str(formData, "clubId"), str(formData, "userId"), me, role as "member" | "officer" | "president");
    back(`/clubs/${slug}/manage`, { ok: "Role updated. Presidency is a handover." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/clubs/${slug}/manage`, { error: errorMessage(error) });
  }
}

export async function announceAction(formData: FormData): Promise<void> {
  const slug = str(formData, "slug");
  await requireWritesEnabled();
  const me = await requireUser(`/clubs/${slug}/manage`);
  const parsed = announcementInput.safeParse({
    title: str(formData, "title"),
    body: str(formData, "body"),
    pinned: bool(formData, "pinned"),
  });
  if (!parsed.success) back(`/clubs/${slug}/manage`, { error: parsed.error.issues[0]?.message });
  try {
    await createAnnouncement(str(formData, "clubId"), me, parsed.data);
    back(`/clubs/${slug}/manage`, { ok: "Announcement published to members." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/clubs/${slug}/manage`, { error: errorMessage(error) });
  }
}
