"use server";

import { moderationReportInput, moderationResolveInput } from "@campussphere/contracts";
import { consumeRateLimit, createReport, resolveReport } from "@campussphere/core";
import { back, errorMessage, isRedirect, nullable, str } from "@/lib/forms";
import { requireUser } from "@/lib/session";
import { requireWritesEnabled } from "@campussphere/core";

export async function reportAction(formData: FormData): Promise<void> {
  const returnTo = str(formData, "returnTo") || "/";
  await requireWritesEnabled();
  const me = await requireUser(returnTo);
  await consumeRateLimit(`moderation.report:${me.id}`, 8, 3600);
  const parsed = moderationReportInput.safeParse({
    targetType: str(formData, "targetType"),
    targetId: str(formData, "targetId"),
    reason: str(formData, "reason"),
    details: nullable(formData, "details"),
  });
  if (!parsed.success) back(returnTo, { error: parsed.error.issues[0]?.message ?? "Check the report." });
  try {
    await createReport(me, parsed.data);
    back(returnTo, { ok: "Report received. A moderator will review it." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(returnTo, { error: errorMessage(error) });
  }
}

export async function resolveReportAction(formData: FormData): Promise<void> {
  await requireWritesEnabled();
  const me = await requireUser("/admin?tab=reports");
  const parsed = moderationResolveInput.safeParse({
    status: str(formData, "status"),
    notes: nullable(formData, "notes"),
  });
  if (!parsed.success) back("/admin?tab=reports", { error: "Check the resolution." });
  try {
    await resolveReport(str(formData, "reportId"), me, parsed.data);
    back("/admin?tab=reports", { ok: "Report updated." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back("/admin?tab=reports", { error: errorMessage(error) });
  }
}
