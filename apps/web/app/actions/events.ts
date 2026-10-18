"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  eventCancelInput,
  eventDecisionInput,
  eventProposalInput,
  eventUpdateInput,
  feedbackInput,
  checkInInput,
} from "@campussphere/contracts";
import {
  cancelEvent,
  cancelRegistration,
  checkIn,
  createEvent,
  createSelfAttendanceToken,
  decideEvent,
  publishEvent,
  registerForEvent,
  submitFeedback,
  updateEvent,
} from "@campussphere/core";
import { back, bool, errorMessage, isRedirect, isoFromLocal, int, nullable, opt, str } from "@/lib/forms";
import { requireUser } from "@/lib/session";
import { requireWritesEnabled } from "@campussphere/core";

const CHECKIN_COOKIE = "cs_checkin_code";

function eventInput(formData: FormData) {
  return {
    title: str(formData, "title"),
    summary: str(formData, "summary"),
    description: str(formData, "description"),
    category: str(formData, "category"),
    startsAt: isoFromLocal(formData, "startsAt") ?? "",
    endsAt: isoFromLocal(formData, "endsAt") ?? "",
    timezone: str(formData, "timezone") || "UTC",
    venueName: nullable(formData, "venueName"),
    venueAddress: nullable(formData, "venueAddress"),
    onlineUrl: nullable(formData, "onlineUrl"),
    capacity: int(formData, "capacity") ?? null,
    waitlistEnabled: bool(formData, "waitlistEnabled"),
    accessibilityNotes: nullable(formData, "accessibilityNotes"),
    contactEmail: nullable(formData, "contactEmail"),
    clubId: nullable(formData, "clubId"),
    coverUrl: nullable(formData, "coverUrl"),
    submit: str(formData, "intent") === "submit",
  };
}

export async function createEventAction(formData: FormData): Promise<void> {
  await requireWritesEnabled();
  const me = await requireUser("/dashboard/events/new");
  const parsed = eventProposalInput.safeParse(eventInput(formData));
  if (!parsed.success) {
    back("/dashboard/events/new", { error: parsed.error.issues[0]?.message ?? "Check the form." });
  }
  try {
    const created = await createEvent(me, parsed.data);
    back(created.status === "submitted" ? "/dashboard" : `/dashboard/events/${created.id}`, {
      ok: created.status === "submitted" ? "Event submitted for review." : "Draft saved.",
    });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back("/dashboard/events/new", { error: errorMessage(error) });
  }
}

export async function updateEventAction(formData: FormData): Promise<void> {
  const eventId = str(formData, "eventId");
  await requireWritesEnabled();
  const me = await requireUser(`/dashboard/events/${eventId}`);
  const raw: Record<string, unknown> = {};
  for (const key of ["title", "summary", "description", "category", "timezone"]) {
    const value = formData.get(key);
    if (typeof value === "string" && value.length > 0) raw[key] = value;
  }
  for (const key of ["venueName", "venueAddress", "onlineUrl", "accessibilityNotes", "contactEmail", "coverUrl", "clubId"]) {
    if (formData.get(key) !== null) raw[key] = nullable(formData, key);
  }
  if (formData.get("startsAt")) raw.startsAt = isoFromLocal(formData, "startsAt");
  if (formData.get("endsAt")) raw.endsAt = isoFromLocal(formData, "endsAt");
  if (formData.get("capacity") !== null) raw.capacity = int(formData, "capacity") ?? null;
  raw.waitlistEnabled = bool(formData, "waitlistEnabled");
  if (str(formData, "intent") === "submit") raw.submit = true;
  const parsed = eventUpdateInput.safeParse(raw);
  if (!parsed.success) back(`/dashboard/events/${eventId}`, { error: parsed.error.issues[0]?.message ?? "Check the form." });
  try {
    await updateEvent(eventId, me, parsed.data);
    back(`/dashboard/events/${eventId}`, { ok: "Event updated." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/dashboard/events/${eventId}`, { error: errorMessage(error) });
  }
}

export async function publishEventAction(formData: FormData): Promise<void> {
  const eventId = str(formData, "eventId");
  await requireWritesEnabled();
  const me = await requireUser(`/dashboard/events/${eventId}`);
  try {
    await publishEvent(eventId, me);
    back(`/dashboard/events/${eventId}`, { ok: "Event published. It now appears publicly." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/dashboard/events/${eventId}`, { error: errorMessage(error) });
  }
}

export async function cancelEventAction(formData: FormData): Promise<void> {
  const eventId = str(formData, "eventId");
  await requireWritesEnabled();
  const me = await requireUser(`/dashboard/events/${eventId}`);
  const parsed = eventCancelInput.safeParse({ reason: str(formData, "reason") });
  if (!parsed.success) back(`/dashboard/events/${eventId}`, { error: parsed.error.issues[0]?.message ?? "Give a reason." });
  try {
    await cancelEvent(eventId, me, parsed.data.reason);
    back(`/dashboard/events/${eventId}`, { ok: "Event cancelled. Registered attendees were notified." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/dashboard/events/${eventId}`, { error: errorMessage(error) });
  }
}

export async function decideEventAction(formData: FormData): Promise<void> {
  await requireWritesEnabled();
  const me = await requireUser("/admin");
  const parsed = eventDecisionInput.safeParse({
    decision: str(formData, "decision"),
    notes: nullable(formData, "notes"),
  });
  if (!parsed.success) back("/admin?tab=events", { error: parsed.error.issues[0]?.message ?? "Check the decision." });
  try {
    await decideEvent(str(formData, "eventId"), me, parsed.data.decision, parsed.data.notes);
    back("/admin?tab=events", { ok: `Event ${parsed.data.decision.replace("_", " ")}.` });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back("/admin?tab=events", { error: errorMessage(error) });
  }
}

export async function registerAction(formData: FormData): Promise<void> {
  const slug = str(formData, "slug");
  await requireWritesEnabled();
  const me = await requireUser(`/events/${slug}`);
  try {
    const registration = await registerForEvent(str(formData, "eventId"), me);
    back(`/events/${slug}`, {
      ok:
        registration.status === "registered"
          ? "You're registered. A confirmation email is queued."
          : `The event is full, so you joined the waitlist at position ${registration.position}.`,
    });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/events/${slug}`, { error: errorMessage(error) });
  }
}

export async function cancelRegistrationAction(formData: FormData): Promise<void> {
  const slug = str(formData, "slug");
  await requireWritesEnabled();
  const me = await requireUser(`/events/${slug}`);
  try {
    await cancelRegistration(str(formData, "eventId"), me);
    back(`/events/${slug}`, { ok: "Registration cancelled. The next person on the waitlist was promoted." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/events/${slug}`, { error: errorMessage(error) });
  }
}

export async function checkInAction(formData: FormData): Promise<void> {
  const eventId = str(formData, "eventId");
  await requireWritesEnabled();
  const me = await requireUser(`/dashboard/events/${eventId}`);
  const parsed = checkInInput.safeParse({ code: str(formData, "code") });
  if (!parsed.success) back(`/dashboard/events/${eventId}`, { error: "Enter a check-in code." });
  try {
    const result = await checkIn(parsed.data.code, me);
    back(`/dashboard/events/${eventId}`, { ok: `${result.attendeeName} checked in.` });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/dashboard/events/${eventId}`, { error: errorMessage(error) });
  }
}

export async function mintCheckInAction(formData: FormData): Promise<void> {
  const eventId = str(formData, "eventId");
  await requireWritesEnabled();
  const me = await requireUser(`/dashboard/events/${eventId}/ticket`);
  try {
    const token = await createSelfAttendanceToken(eventId, me);
    const store = await cookies();
    store.set(CHECKIN_COOKIE, JSON.stringify({ code: token.code, expiresAt: token.expiresAt }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 2,
    });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/dashboard/events/${eventId}/ticket`, { error: errorMessage(error) });
  }
  redirect(`/dashboard/events/${eventId}/ticket`);
}

export async function feedbackAction(formData: FormData): Promise<void> {
  const slug = str(formData, "slug");
  await requireWritesEnabled();
  const me = await requireUser(`/events/${slug}`);
  const parsed = feedbackInput.safeParse({
    rating: Number(str(formData, "rating")),
    comment: nullable(formData, "comment"),
  });
  if (!parsed.success) back(`/events/${slug}`, { error: "Choose a rating from 1 to 5." });
  try {
    await submitFeedback(str(formData, "eventId"), me, parsed.data);
    back(`/events/${slug}`, { ok: "Thanks — your feedback was recorded." });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/events/${slug}`, { error: errorMessage(error) });
  }
}

