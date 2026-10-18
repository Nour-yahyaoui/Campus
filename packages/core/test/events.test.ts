import { describe, expect, it } from "vitest";
import { makeAdmin, makeClub, makeUser, resetDb } from "./helpers";
import { query } from "../src/db";
import {
  cancelRegistration,
  checkIn,
  createAttendanceToken,
  createEvent,
  decideEvent,
  getEventBySlug,
  listRoster,
  markNoShows,
  publishEvent,
  registerForEvent,
  submitFeedback,
} from "../src/services/events";

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

async function publishedEvent(capacity: number | null, waitlistEnabled = true) {
  const organizer = await makeUser({ name: "Organizer" });
  const admin = await makeAdmin();
  const event = await createEvent(organizer, {
    title: "Campus robotics demo night",
    summary: "Student robots, live demos and a short Q&A with the teams.",
    description:
      "Join us for an evening of student robotics demos in the main hall. Teams will show their builds " +
      "and answer questions. Open to all students and staff, no experience required.",
    category: "technology",
    startsAt: inDays(3),
    endsAt: inDays(3.1),
    timezone: "Africa/Tunis",
    venueName: "Main Hall",
    capacity,
    waitlistEnabled,
    submit: true,
  });
  await decideEvent(event.id, admin, "approve", "Approved for the pilot.");
  await publishEvent(event.id, organizer);
  return { event, organizer, admin };
}

describe("events: capacity, waitlist and attendance", () => {
  it("never oversubscribes capacity under concurrent registrations", async () => {
    await resetDb();
    const { event } = await publishedEvent(3);
    const students = await Promise.all(Array.from({ length: 9 }, (_, index) => makeUser({ name: `Student ${index}` })));
    await Promise.all(students.map((student) => registerForEvent(event.id, student)));

    const detail = await getEventBySlug(event.slug, null);
    expect(detail.registeredCount).toBe(3);
    expect(detail.waitlistCount).toBe(6);
  });

  it("promotes the first waitlisted person when a seat frees up", async () => {
    await resetDb();
    const { event } = await publishedEvent(1);
    const first = await makeUser({ name: "First" });
    const second = await makeUser({ name: "Second" });
    const third = await makeUser({ name: "Third" });

    const firstRegistration = await registerForEvent(event.id, first);
    const secondRegistration = await registerForEvent(event.id, second);
    const thirdRegistration = await registerForEvent(event.id, third);
    expect(firstRegistration.status).toBe("registered");
    expect(secondRegistration.status).toBe("waitlisted");
    expect(thirdRegistration.position).toBe(2);

    await cancelRegistration(event.id, first);
    const detail = await getEventBySlug(event.slug, second);
    expect(detail.registration?.status).toBe("registered");
    // The remaining waitlist keeps its order.
    const waitlisted = await listRoster(event.id, await makeAdmin());
    expect(waitlisted.find((row) => row.user.id === third.id)?.status).toBe("waitlisted");
  });

  it("prevents duplicate active registrations", async () => {
    await resetDb();
    const { event } = await publishedEvent(10);
    const student = await makeUser();
    await registerForEvent(event.id, student);
    const again = await registerForEvent(event.id, student);
    expect(again.status).toBe("registered");
    const roster = await listRoster(event.id, await makeAdmin());
    expect(roster.filter((row) => row.user.id === student.id)).toHaveLength(1);
  });

  it("consumes a check-in code exactly once and records attendance", async () => {
    await resetDb();
    const { event, organizer } = await publishedEvent(5);
    const student = await makeUser({ name: "Attendee" });
    await registerForEvent(event.id, student);
    const roster = await listRoster(event.id, organizer);
    const registration = roster[0]!;
    const token = await createAttendanceToken(event.id, registration.registrationId, organizer);

    const result = await checkIn(token.code, organizer);
    expect(result.attendeeName).toBe("Attendee");
    await expect(checkIn(token.code, organizer)).rejects.toMatchObject({ code: "conflict" });

    const after = await listRoster(event.id, organizer);
    expect(after[0]!.status).toBe("attended");
    expect(after[0]!.checkedInAt).not.toBeNull();
  });

  it("refuses check-in by someone who is not an organizer", async () => {
    await resetDb();
    const { event, organizer } = await publishedEvent(5);
    const student = await makeUser();
    await registerForEvent(event.id, student);
    const roster = await listRoster(event.id, organizer);
    const token = await createAttendanceToken(event.id, roster[0]!.registrationId, organizer);
    await expect(checkIn(token.code, student)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("does not accept registrations before approval or after cancellation", async () => {
    await resetDb();
    const organizer = await makeUser();
    const admin = await makeAdmin();
    const event = await createEvent(organizer, {
      title: "Draft-only event title",
      summary: "An event summary that is long enough to pass validation.",
      description:
        "This description is long enough to satisfy the validation rules for event proposals on the platform.",
      category: "academic",
      startsAt: inDays(2),
      endsAt: inDays(2.1),
      timezone: "UTC",
      venueName: "Room 4",
      submit: true,
    });
    const student = await makeUser();
    await expect(registerForEvent(event.id, student)).rejects.toMatchObject({ code: "conflict" });
    await decideEvent(event.id, admin, "approve", "OK.");
    await publishEvent(event.id, organizer);
    const registration = await registerForEvent(event.id, student);
    expect(registration.status).toBe("registered");
  });

  it("allows feedback only after the event, from attendees", async () => {
    await resetDb();
    const organizer = await makeUser();
    const admin = await makeAdmin();
    const event = await createEvent(organizer, {
      title: "Yesterday's workshop",
      summary: "A workshop used to verify the feedback window rules.",
      description:
        "The event is created in the future so it can be published, then shifted into the past in the test.",
      category: "academic",
      startsAt: inDays(1),
      endsAt: inDays(1.1),
      timezone: "UTC",
      venueName: "Lab 2",
      submit: true,
    });
    await decideEvent(event.id, admin, "approve", "OK.");
    await publishEvent(event.id, organizer);
    const student = await makeUser();
    await registerForEvent(event.id, student);
    // The event then happens, and time moves on.
    await query("update events set starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' where id = $1", [event.id]);
    await expect(submitFeedback(event.id, student, { rating: 4 })).rejects.toMatchObject({ code: "forbidden" });

    const organizerRoster = await listRoster(event.id, organizer);
    const token = await createAttendanceToken(event.id, organizerRoster[0]!.registrationId, organizer);
    await checkIn(token.code, organizer);
    await submitFeedback(event.id, student, { rating: 5, comment: "Great session." });
    const detail = await getEventBySlug(event.slug, student);
    expect(detail.feedback?.rating).toBe(5);
    await markNoShows(); // should not touch attendees
  });
});
