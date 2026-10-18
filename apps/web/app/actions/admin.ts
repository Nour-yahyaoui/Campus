"use server";

import { z } from "zod";
import { adminRoleInput, maintenanceInput, suspensionInput } from "@campussphere/contracts";
import {
  adminCreateClub,
  setClubVerification,
  setMaintenanceState,
  setSuspension,
  setUserRoles,
} from "@campussphere/core";
import { back, bool, errorMessage, isRedirect, nullable, str } from "@/lib/forms";
import { requireSuperAdmin } from "@/lib/session";

export async function setRolesAction(formData: FormData): Promise<void> {
  const me = await requireSuperAdmin("/admin/users");
  const roles = formData.getAll("roles").map(String).filter((role) => role === "moderator" || role === "super_admin");
  const parsed = adminRoleInput.safeParse({ roles });
  if (!parsed.success) back("/admin/users", { error: "Check the roles." });
  try {
    await setUserRoles(me, str(formData, "userId"), ["student", ...parsed.data.roles] as Array<"student" | "moderator" | "super_admin">);
    back("/admin/users", { ok: "Roles updated. Sessions were revoked if admin access was removed." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back("/admin/users", { error: errorMessage(error) });
  }
}

export async function suspendAction(formData: FormData): Promise<void> {
  const me = await requireSuperAdmin("/admin/users");
  const parsed = suspensionInput.safeParse({
    suspended: str(formData, "suspended") === "true",
    reason: str(formData, "reason"),
  });
  if (!parsed.success) back("/admin/users", { error: parsed.error.issues[0]?.message ?? "Give a reason." });
  try {
    await setSuspension(me, str(formData, "userId"), parsed.data.suspended, parsed.data.reason);
    back("/admin/users", { ok: parsed.data.suspended ? "Account suspended." : "Account reactivated." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back("/admin/users", { error: errorMessage(error) });
  }
}

export async function maintenanceAction(formData: FormData): Promise<void> {
  const me = await requireSuperAdmin("/admin/settings");
  const parsed = maintenanceInput.safeParse({
    enabled: bool(formData, "enabled"),
    message: nullable(formData, "message"),
  });
  if (!parsed.success) back("/admin/settings", { error: "Check the maintenance settings." });
  try {
    await setMaintenanceState(me, parsed.data);
    back("/admin/settings", {
      ok: parsed.data.enabled ? "Maintenance mode on: writes now return 503." : "Maintenance mode off.",
    });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back("/admin/settings", { error: errorMessage(error) });
  }
}

export async function verifyClubAction(formData: FormData): Promise<void> {
  const me = await requireSuperAdmin("/admin/clubs");
  try {
    await setClubVerification(me, str(formData, "clubId"), str(formData, "verified") === "true");
    back("/admin/clubs", { ok: "Club verification updated." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back("/admin/clubs", { error: errorMessage(error) });
  }
}

const newClubSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(20).max(8000),
  tagline: z.string().trim().max(160).optional().nullable(),
  category: z.enum([
    "academic", "arts", "career", "cultural", "environment",
    "media", "sports", "technology", "volunteering", "other",
  ]),
  membershipPolicy: z.enum(["open", "request", "invite"]),
});

export async function createClubAction(formData: FormData): Promise<void> {
  const me = await requireSuperAdmin("/admin/clubs");
  const parsed = newClubSchema.safeParse({
    name: str(formData, "name"),
    description: str(formData, "description"),
    tagline: nullable(formData, "tagline"),
    category: str(formData, "category"),
    membershipPolicy: str(formData, "membershipPolicy") || "request",
  });
  if (!parsed.success) back("/admin/clubs", { error: parsed.error.issues[0]?.message ?? "Check the form." });
  try {
    await adminCreateClub(me, parsed.data);
    back("/admin/clubs", { ok: `Created ${parsed.data.name}. You are its first president.` });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back("/admin/clubs", { error: errorMessage(error) });
  }
}

