#!/usr/bin/env node
/**
 * Development seed. Refused in production and when the database already
 * contains demo content. Every seeded row is flagged through the `demo`
 * setting so the UI can label the preview honestly.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.NODE_ENV = process.env.NODE_ENV ?? "development";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed a production database.");
  process.exit(2);
}

const { query, one, closePool, findMeById, createClub, changeMemberRole, createProject, decideProject,
  applyToProject, decideApplication, createTask, createMilestone, publishProjectUpdate,
  createEvent, decideEvent, publishEvent, registerForEvent, createAttendanceToken, checkIn,
  submitFeedback, createAnnouncement, joinClub, decideMembership } =
  await import(path.join(root, "packages/core/src/index.ts"));

const log = (message) => console.log(`• ${message}`);

async function user(email, name, roles = ["student"]) {
  const existing = await one("select id from users where lower(email) = $1", [email]);
  if (existing) return findMeById(existing.id);
  const row = await one(
    `insert into users (email, email_verified, name, bio, roles)
     values ($1, true, $2, $3, $4::global_role[]) returning id`,
    [email, name, "Demo account for local development of CampusSphere.", roles],
  );
  return findMeById(row.id);
}

async function main() {
  const demo = await one("select value from settings where key = 'demo'");
  if (demo?.value?.seeded) {
    console.log("Demo content is already seeded. Nothing to do.");
    await closePool();
    return;
  }
  const population = await one("select count(*)::int as n from clubs");
  if ((population?.n ?? 0) > 0) {
    console.error(
      `This database already has ${population.n} clubs but no demo marker — it is not an empty database.\n` +
        "Refusing to add duplicate demo content. Reset first:\n" +
        "  node scripts/db.mjs reset && npm run db:seed",
    );
    await closePool();
    process.exitCode = 2;
    return;
  }

  const admin = await user("admin@campussphere.local", "Nour Admin", ["student", "super_admin"]);
  const officer = await user("officer@campussphere.local", "Amira Officer");
  const lead = await user("lead@campussphere.local", "Yassine Lead");
  const student = await user("student@campussphere.local", "Sami Student");
  log("accounts: admin, officer, lead, student");

  const robotics = await createClub(admin, {
    name: "Robotics Society",
    tagline: "Build things that move, then make them move better.",
    description:
      "The Robotics Society is a student-run workshop for anyone curious about machines. We run weekly build nights, " +
      "prepare teams for national competitions and maintain a shared parts library. No experience required — we pair " +
      "beginners with experienced builders. Open to every faculty.",
    category: "technology",
    membershipPolicy: "open",
    contactEmail: "robotics@campussphere.local",
  });
  const debate = await createClub(admin, {
    name: "Debate Union",
    tagline: "Argue better, in public, with evidence.",
    description:
      "A parliamentary debate society meeting every Tuesday. We coach new speakers, host internal motions and send " +
      "teams to regional tournaments. Membership is open after one introductory session so the room stays balanced.",
    category: "academic",
    membershipPolicy: "request",
  });
  const eco = await createClub(admin, {
    name: "Eco Collective",
    tagline: "Small campus projects with measurable impact.",
    description:
      "We plant, repair, compost and campaign. Current work includes the courtyard garden, a repair café and a waste " +
      "audit with the facilities team. Volunteering hours are recorded for participating students.",
    category: "environment",
    membershipPolicy: "open",
  });
  const film = await createClub(admin, {
    name: "Film Club",
    tagline: "Screenings, critiques and student shorts.",
    description:
      "Fortnightly screenings in the small auditorium followed by discussion, plus production workshops for students " +
      "making their first short film. Equipment is shared and booked through the club.",
    category: "arts",
    membershipPolicy: "request",
  });
  log("clubs: Robotics, Debate, Eco, Film");

  // Hand leadership to the demo officer so role scoping is visible. A person
  // must already be an active member before a role can change.
  for (const club of [robotics, eco]) {
    await joinClub(club.id, officer);
    await changeMemberRole(club.id, officer.id, admin, "president");
  }

  await joinClub(debate.id, officer, "I would like to help organise this term's motions.");
  const officerDebate = await one(
    "select id from club_memberships where club_id = $1 and user_id = $2",
    [debate.id, officer.id],
  );
  await decideMembership(debate.id, officerDebate.id, admin, { status: "active", role: "officer" });

  await joinClub(debate.id, student, "I have debated before and want to coach beginners.");
  const pending = await one("select id from club_memberships where club_id = $1 and user_id = $2 and status = 'pending'", [debate.id, student.id]);
  if (pending) await decideMembership(debate.id, pending.id, officer, { status: "active" });
  await joinClub(eco.id, student, null);

  await createAnnouncement(robotics.id, officer, {
    title: "Build night moved to Thursday",
    body: "The workshop is booked on Wednesday, so this week we meet Thursday at 18:00 in Lab 2. Bring a laptop if you have one; tools stay in the lab.",
    pinned: true,
  });
  await createAnnouncement(eco.id, officer, {
    title: "Courtyard planting this Saturday",
    body: "We have 40 seedlings and two hours. Meet at the greenhouse at 09:30. Gloves provided, coffee afterwards.",
  });
  log("memberships and announcements");

  const solar = await createProject(lead, {
    title: "Solar charging bench for the courtyard",
    summary: "A student-built bench that charges phones from a small solar array and teaches passers-by how it works.",
    description:
      "The engineering courtyard has sun all day and no outdoor power. We will design a bench with a 60W panel, a " +
      "weatherproof battery box and four USB-C ports, then publish an open build guide so other campuses can copy it. " +
      "The facilities team has agreed to review the installation plan before anything is bolted down.",
    category: "campus-improvement",
    goals: "One working bench, an open build guide and a maintenance checklist for the facilities team.",
    expectedImpact: "A visible, useful demonstration of student engineering that keeps working after the team graduates.",
    timeline: "Design in October, build in November, install before the winter break.",
    resources: "Roughly €220 for panel, battery, controller and weatherproof enclosure.",
    visibility: "public",
    submit: true,
    roles: [
      { title: "Electronics builder", description: "Wiring, soldering and testing the charge controller.", slots: 2 },
      { title: "Documentation lead", description: "Turn the build into a public guide with photos.", slots: 1 },
    ],
  });
  await decideProject(solar.id, admin, "approve", "Clear scope, sensible budget, and the facilities review is already planned.");

  const garden = await createProject(officer, {
    title: "Courtyard food garden",
    summary: "Convert the unused strip beside the library into a raised-bed garden maintained by volunteers.",
    description:
      "We want to turn a neglected strip of gravel into eight raised beds growing herbs and easy vegetables for the " +
      "campus kitchen. The project includes a watering schedule, a compost bin and a handover plan for the summer.",
    category: "gardening",
    goals: "Eight beds, a compost system and a volunteer rota that survives exam season.",
    timeline: "Beds built in November, first harvest in spring.",
    resources: "Timber, soil and seedlings; the estates team offered surplus timber.",
    clubId: eco.id,
    submit: true,
    roles: [{ title: "Garden volunteer", description: "Two hours a week, flexible.", slots: 6 }],
  });
  await decideProject(garden.id, admin, "approve", "Approved as a pilot with the Eco Collective.");

  const study = await createProject(student, {
    title: "Peer study map for first-year courses",
    summary: "A simple, privacy-respecting way for first-years to find study groups in their own course.",
    description:
      "First-year students often do not know anyone in their lectures. We propose a lightweight board where students " +
      "can post a course code and a meeting time, with no public profiles required. The proposal needs a privacy review " +
      "before it goes further.",
    category: "software",
    submit: true,
    roles: [{ title: "Backend developer", description: "Comfortable with SQL and access control.", slots: 1 }],
  });
  log("projects: 2 approved, 1 awaiting review");

  const application = await applyToProject(solar.id, student, {
    roleId: (await one("select id from project_roles where project_id = $1 order by created_at limit 1", [solar.id])).id,
    message: "I built a smaller solar charger for a school project last year and I can document the wiring clearly.",
  });
  await decideApplication(solar.id, application.id, lead, { decision: "accepted", note: "Welcome aboard." });
  await applyToProject(garden.id, student, {
    message: "I volunteer at a community garden on weekends and can help with the watering rota.",
  });

  await createTask(solar.id, lead, { title: "Order panel and charge controller", description: "Compare two suppliers and confirm the dimensions.", status: "doing", assigneeId: student.id });
  await createTask(solar.id, lead, { title: "Draft the installation plan for facilities", status: "todo" });
  await createMilestone(solar.id, lead, { title: "Design review with facilities", dueDate: new Date(Date.now() + 12 * 86400000).toISOString() });
  await publishProjectUpdate(solar.id, lead, {
    title: "Bench dimensions agreed",
    body: "Facilities approved a 1.8m bench along the east wall. The panel will be tilted at 30° and the battery box sits underneath, out of the rain.",
  });
  log("project workspace: tasks, milestone, update, application");

  const workshop = await createEvent(officer, {
    title: "Intro to soldering workshop",
    summary: "Two hours, real boards, and you leave with a working LED badge.",
    description:
      "A hands-on introduction to soldering for complete beginners. We provide boards, components and irons; you bring " +
      "patience and, if possible, glasses. We finish with a working LED badge and a short safety briefing for anyone " +
      "who wants to use the lab independently afterwards.",
    category: "technology",
    startsAt: new Date(Date.now() + 4 * 86400000 + 18 * 3600000).toISOString(),
    endsAt: new Date(Date.now() + 4 * 86400000 + 20 * 3600000).toISOString(),
    timezone: "Africa/Tunis",
    venueName: "Engineering Lab 2",
    venueAddress: "Building C, ground floor",
    capacity: 16,
    waitlistEnabled: true,
    accessibilityNotes: "Step-free access from the east entrance. Two seated workstations with adjustable height.",
    contactEmail: "robotics@campussphere.local",
    clubId: robotics.id,
    submit: true,
  });
  await decideEvent(workshop.id, admin, "approve", "Good beginner session; safety briefing is included.");
  await publishEvent(workshop.id, officer);

  const demoNight = await createEvent(officer, {
    title: "Robotics demo night",
    summary: "Student robots, live demos and a very informal Q&A.",
    description:
      "Teams show what they built this semester: line followers, a small arm and the solar bench prototype. Short demos " +
      "every fifteen minutes, then an open floor for questions and recruitment.",
    category: "technology",
    startsAt: new Date(Date.now() + 11 * 86400000 + 17 * 3600000).toISOString(),
    endsAt: new Date(Date.now() + 11 * 86400000 + 19 * 3600000).toISOString(),
    timezone: "Africa/Tunis",
    venueName: "Main Hall",
    capacity: 80,
    waitlistEnabled: true,
    clubId: robotics.id,
    submit: true,
  });
  await decideEvent(demoNight.id, admin, "approve", "Approved.");
  await publishEvent(demoNight.id, officer);

  const debateNight = await createEvent(officer, {
    title: "Open debate: should campus go car-free?",
    summary: "A public motion, two teams and an audience vote.",
    description:
      "The Debate Union hosts an open parliamentary debate on whether the campus should ban private cars. Speakers from " +
      "both sides, a moderated floor and a vote at the end. No preparation needed to attend.",
    category: "academic",
    startsAt: new Date(Date.now() + 18 * 86400000 + 18 * 3600000).toISOString(),
    endsAt: new Date(Date.now() + 18 * 86400000 + 20 * 3600000).toISOString(),
    timezone: "Africa/Tunis",
    venueName: "Auditorium B",
    capacity: 120,
    clubId: debate.id,
    submit: true,
  });
  await decideEvent(debateNight.id, admin, "approve", "Approved.");
  await publishEvent(debateNight.id, officer);

  await createEvent(lead, {
    title: "Solar bench build weekend",
    summary: "A two-day build sprint for the courtyard charging bench project.",
    description:
      "We assemble the bench, mount the panel and test the charging circuit over a weekend. Volunteers welcome for " +
      "either day; no tools required for the painting and assembly tasks.",
    category: "community",
    startsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    endsAt: new Date(Date.now() + 31 * 86400000).toISOString(),
    timezone: "Africa/Tunis",
    venueName: "Workshop yard",
    capacity: 20,
    submit: true,
  });

  // Registration + waitlist in action: capacity 2 for a small session.
  const small = await createEvent(officer, {
    title: "Robot arm teardown session",
    summary: "We take apart a donated arm and map every joint.",
    description:
      "A small, hands-on session where we disassemble a donated robot arm, label the motors and document what a repair " +
      "would cost. Limited to two people because there is one bench.",
    category: "technology",
    startsAt: new Date(Date.now() + 7 * 86400000 + 16 * 3600000).toISOString(),
    endsAt: new Date(Date.now() + 7 * 86400000 + 18 * 3600000).toISOString(),
    timezone: "Africa/Tunis",
    venueName: "Lab 2",
    capacity: 2,
    waitlistEnabled: true,
    clubId: robotics.id,
    submit: true,
  });
  await decideEvent(small.id, admin, "approve", "Approved.");
  await publishEvent(small.id, officer);
  await registerForEvent(small.id, student);
  await registerForEvent(small.id, lead);

  // A past event, shifted in time after publishing, so feedback and check-in
  // are demonstrable without mocking dates anywhere in the app.
  const past = await createEvent(officer, {
    title: "Arduino basics",
    summary: "A first hour with microcontrollers, breadboards and blinking LEDs.",
    description:
      "An introductory session covering the Arduino IDE, digital outputs and reading a button. Boards provided. We " +
      "finished with a small challenge: make three LEDs blink in sequence without copying code.",
    category: "technology",
    startsAt: new Date(Date.now() + 1 * 86400000).toISOString(),
    endsAt: new Date(Date.now() + 1.1 * 86400000).toISOString(),
    timezone: "Africa/Tunis",
    venueName: "Lab 2",
    capacity: 20,
    clubId: robotics.id,
    submit: true,
  });
  await decideEvent(past.id, admin, "approve", "Approved.");
  await publishEvent(past.id, officer);
  await registerForEvent(past.id, student);
  await query(
    "update events set starts_at = now() - interval '5 days', ends_at = now() - interval '5 days' + interval '2 hours' where id = $1",
    [past.id],
  );
  const roster = await import(path.join(root, "packages/core/src/index.ts")).then((core) => core.listRoster(past.id, officer));
  const token = await createAttendanceToken(past.id, roster[0].registrationId, officer);
  await checkIn(token.code, officer);
  await submitFeedback(past.id, student, { rating: 5, comment: "The three-LED challenge made the concepts click." });

  await query(
    `insert into settings (key, value) values ('demo', $1)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify({ seeded: true, seededAt: new Date().toISOString() })],
  );

  log("events: 4 published, 1 awaiting review, 1 past with attendance & feedback");
  console.log("\nSeed complete. Demo accounts:");
  console.log("  admin@campussphere.local    (super-admin)");
  console.log("  officer@campussphere.local  (club president/officer)");
  console.log("  lead@campussphere.local     (project lead)");
  console.log("  student@campussphere.local  (student)");
  await closePool();
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
  await closePool().catch(() => {});
}
