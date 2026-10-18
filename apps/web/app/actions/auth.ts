"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { devLoginInput, profileUpdateInput } from "@campussphere/contracts";
import {
  consumeRateLimit,
  devSignIn,
  hashToken,
  requestDeletion,
  updateProfile,
  exportMyData,
} from "@campussphere/core";
import { back, bool, errorMessage, isRedirect, str } from "@/lib/forms";
import { clearSessionCookie, requireUser, safeNext, setSessionCookie } from "@/lib/session";

export async function devSignInAction(formData: FormData): Promise<void> {
  const next = safeNext(str(formData, "next"));
  const parsed = devLoginInput.safeParse({
    email: str(formData, "email"),
    name: str(formData, "name") || undefined,
  });
  if (!parsed.success) {
    back("/login", { error: parsed.error.issues[0]?.message ?? "Check the form.", next });
  }
  try {
    const headerList = await headers();
    const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    // Sign-in is the highest-value endpoint to brute-force; cap it per address.
    await consumeRateLimit(`auth.dev:${hashToken(ip).slice(0, 24)}`, 10, 300);
    const session = await devSignIn({
      email: parsed.data.email,
      name: parsed.data.name,
      userAgent: headerList.get("user-agent"),
      ip,
    });
    await setSessionCookie(session);
  } catch (error) {
    if (isRedirect(error)) throw error;
    back("/login", { error: errorMessage(error), next });
  }
  redirect(next);
}

export async function updateProfileAction(formData: FormData): Promise<void> {
  const me = await requireUser("/dashboard/profile");
  const parsed = profileUpdateInput.safeParse({
    name: str(formData, "name"),
    bio: str(formData, "bio") || null,
  });
  if (!parsed.success) {
    back("/dashboard/profile", { error: parsed.error.issues[0]?.message ?? "Check the form." });
  }
  try {
    await updateProfile(me, parsed.data);
    back("/dashboard/profile", { ok: "Profile updated." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back("/dashboard/profile", { error: errorMessage(error) });
  }
}

export async function requestDeletionAction(formData: FormData): Promise<void> {
  const me = await requireUser("/dashboard/profile");
  if (!bool(formData, "confirm")) {
    back("/dashboard/profile", { error: "Tick the confirmation box first." });
  }
  try {
    await requestDeletion(me);
    await clearSessionCookie();
  } catch (error) {
    if (isRedirect(error)) throw error;
    back("/dashboard/profile", { error: errorMessage(error) });
  }
  redirect("/?deleted=1");
}
