"use server";

import { markAllRead, markRead } from "@campussphere/core";
import { back, errorMessage, isRedirect, str } from "@/lib/forms";
import { requireUser } from "@/lib/session";

export async function markReadAction(formData: FormData): Promise<void> {
  const me = await requireUser("/dashboard/notifications");
  try {
    await markRead(me.id, str(formData, "notificationId"));
    back("/dashboard/notifications", {});
  } catch (error) {
    if (isRedirect(error)) throw error;
    back("/dashboard/notifications", { error: errorMessage(error) });
  }
}

export async function markAllReadAction(): Promise<void> {
  const me = await requireUser("/dashboard/notifications");
  const count = await markAllRead(me.id);
  back("/dashboard/notifications", { ok: `${count} notification${count === 1 ? "" : "s"} marked read.` });
}
