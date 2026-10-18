#!/usr/bin/env node
/**
 * Realistic demo data at scale.
 *
 *   node scripts/seed-demo.mjs                       # local: 3,000 people, 240 clubs, 2,000 events
 *   node scripts/seed-demo.mjs --reset               # wipe content first (refused in production)
 *   DATABASE_URL=postgres://… node scripts/seed-demo.mjs --allow-production
 *
 * Why this exists next to `seed.mjs`: that script makes four accounts and three
 * clubs so a developer can click through every role. This one answers a
 * different question — does the product still behave when the catalogue is not
 * a toy? Pagination, cursor stability, search, the review queues and the
 * Observatory's percentiles all only become meaningful against thousands of
 * rows.
 *
 * Design notes:
 *  - One transaction. A half-seeded database is worse than an empty one.
 *  - Deterministic: `--seed=1234` reproduces the same catalogue, including the
 *    RNG-driven choices, so a broken page can be reproduced.
 *  - Every seeded row is traceable: people are on `@students.example.edu`
 *    (reserved by RFC 2606) and the counts are recorded in `settings.demo`, so
 *    `--reset` can explain what it is about to delete.
 *  - Direct SQL rather than the service layer: 3,000 users through `createClub`
 *    would spend minutes in audit writes and per-row round trips, and the
 *    constraints this data must satisfy are enforced by PostgreSQL anyway.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------------ */
/* Arguments and configuration                                        */
/* ------------------------------------------------------------------ */

const options = new Map();
for (const raw of process.argv.slice(2)) {
  const [key, value = "true"] = raw.replace(/^--/, "").split("=");
  options.set(key, value);
}

const num = (name, fallback) => {
  const value = Number(options.get(name) ?? fallback);
  if (!Number.isFinite(value) || value < 0) throw new Error(`--${name} must be a number`);
  return Math.trunc(value);
};

const config = {
  users: num("users", 3000),
  clubs: num("clubs", 240),
  events: num("events", 2000),
  projects: num("projects", 320),
  seed: num("seed", 20261018),
  reset: options.has("reset"),
  allowProduction: options.has("allow-production"),
};

async function loadEnv() {
  try {
    const content = await readFile(path.join(root, ".env"), "utf8");
    for (const raw of content.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* optional */
  }
}

await loadEnv();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(2);
}

const target = new URL(process.env.DATABASE_URL);
const isProduction = process.env.NODE_ENV === "production" || target.hostname.includes("neon.tech");
if (isProduction && !config.allowProduction) {
  console.error(
    "This looks like a production database. Re-run with --allow-production to seed it.\n" +
      "Additive seeding never deletes: it refuses if demo data is already present.\n" +
      "Refusing --reset on a production database is intentional.",
  );
  process.exit(2);
}
if (config.reset && isProduction) {
  console.error("--reset deletes every row in the content tables. That is refused for production.");
  process.exit(2);
}

/* ------------------------------------------------------------------ */
/* Deterministic randomness                                           */
/* ------------------------------------------------------------------ */

function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(config.seed);
const pick = (list) => list[Math.floor(random() * list.length)];
const chance = (probability) => random() < probability;
const int = (min, max) => min + Math.floor(random() * (max - min + 1));
const pickSome = (list, count) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
};

/**
 * Walks a population without allocating or shuffling it, so sampling 120
 * attendees from 3,000 people 2,000 times stays linear. The step is coprime with
 * the population size, which guarantees no repeat until every index is used.
 */
const STEPS = [7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
function sampleIndices(size, count) {
  if (count >= size) return Array.from({ length: size }, (_, index) => index);
  const step = STEPS.find((candidate) => size % candidate !== 0) ?? 1;
  const start = int(0, size - 1);
  const indices = [];
  for (let i = 0; i < count; i += 1) {
    indices.push((start + i * step) % size);
  }
  return indices;
}

/* ------------------------------------------------------------------ */
/* Vocabulary                                                         */
/* ------------------------------------------------------------------ */

const FIRST_NAMES = [
  "Amina", "Youssef", "Lina", "Karim", "Sarra", "Mehdi", "Ines", "Omar", "Maryam", "Adam",
  "Salma", "Yassine", "Nour", "Bilel", "Rania", "Hamza", "Farah", "Anis", "Dorra", "Walid",
  "Sofia", "Ali", "Hiba", "Nabil", "Emna", "Seif", "Aya", "Rami", "Lamis", "Tarek",
  "Chaima", "Zied", "Malek", "Firas", "Sana", "Aymen", "Yasmine", "Moez", "Rim", "Khalil",
  "Leila", "Sami", "Meriem", "Hedi", "Asma", "Amine", "Jouda", "Bassem", "Hana", "Marwen",
  "Imen", "Slim", "Racha", "Wael", "Ghada", "Nader", "Wafa", "Iheb", "Syrine", "Chadi",
  "Ahmed", "Kenza", "Maher", "Lilia", "Taha", "Anissa", "Yosra", "Zakaria", "Sonia", "Achref",
];

const LAST_NAMES = [
  "Ben Ali", "Trabelsi", "Gharbi", "Mansouri", "Bouazizi", "Jelassi", "Ayari", "Chaabane",
  "Hamdi", "Zouari", "Khelifi", "Ben Salah", "Ferchichi", "Mabrouk", "Ben Amor", "Rekik",
  "Sassi", "Jebali", "Belhaj", "Guesmi", "Ouali", "Baccouche", "Mejri", "Kacem",
  "Haddad", "Nasri", "Saidi", "Bouzid", "Ltaief", "Dridi", "Bouhlel", "Charfi",
  "Aloui", "Bensalem", "Chouchane", "Daoud", "Ellouze", "Feki", "Ghanmi", "Hachicha",
  "Idrissi", "Jendoubi", "Kammoun", "Lahmar", "Masmoudi", "Njeh", "Oueslati", "Riahi",
  "Souissi", "Tlili", "Yahyaoui", "Zribi", "Amri", "Ben Youssef", "Chérif", "Dhouib",
  "Fourati", "Gargouri", "Hammami", "Karray", "Louati", "Miled", "Nouri", "Rekaya",
];

const MAJORS = [
  "Computer Science", "Software Engineering", "Mechanical Engineering", "Electrical Engineering",
  "Civil Engineering", "Biology", "Chemistry", "Physics", "Mathematics", "Economics",
  "Business Administration", "Finance", "Architecture", "Medicine", "Pharmacy", "Law",
  "Political Science", "Sociology", "Psychology", "History", "Philosophy", "Linguistics",
  "Environmental Science", "Agronomy", "Design", "Journalism", "Education", "Nursing",
];

const BIOS = [
  "Third-year {major} student. Usually building something in the workshop or debugging it afterwards.",
  "{major} student, class of {year}. Here for the workshops and the free coffee.",
  "Studying {major}. I care about making campus a little easier to navigate for first-years.",
  "Final-year {major}. Ask me about the lab equipment booking spreadsheet.",
  "{major} undergraduate. Joined three clubs and now runs one of them.",
  "Exchange student in {major}. Happy to help with anything involving a soldering iron.",
  "{major}, second year. Mostly here for the reading lists and the hiking trips.",
  "Part-time {major} student and full-time cyclist. Report anything broken to me.",
];

const CLUB_TOPICS = {
  academic: ["Debate", "Mathematics", "Model United Nations", "Quiz Bowl", "Economics", "Philosophy", "Astronomy", "Law", "Medicine", "Linguistics", "Statistics", "History"],
  arts: ["Photography", "Film", "Theatre", "Jazz", "Ceramics", "Illustration", "Poetry", "Dance", "A Cappella", "Printmaking", "Street Art", "Choir"],
  career: ["Consulting", "Entrepreneurship", "Finance", "Product Management", "Data Science", "Public Speaking", "Career Readiness", "Marketing", "Engineering Design"],
  cultural: ["African Students", "Arab Culture", "Latin American", "South Asian", "East Asian", "Mediterranean", "Francophone", "International Students", "Heritage", "Culinary"],
  environment: ["Climate Action", "Urban Gardening", "Biodiversity", "Zero Waste", "Renewable Energy", "Hiking", "Birdwatching", "River Cleanup", "Beekeeping"],
  media: ["Student Radio", "Campus Newspaper", "Podcasting", "Video Production", "Photojournalism", "Zine", "Documentary"],
  sports: ["Basketball", "Football", "Running", "Climbing", "Swimming", "Badminton", "Table Tennis", "Volleyball", "Cycling", "Fencing", "Rowing", "Handball"],
  technology: ["Robotics", "Competitive Programming", "Open Source", "Artificial Intelligence", "Cybersecurity", "Game Development", "3D Printing", "Linux", "Web Development", "Quantum Computing", "Embedded Systems", "Drone"],
  volunteering: ["Tutoring", "Community Kitchen", "Blood Donation", "Animal Welfare", "Literacy", "Elder Care", "Disaster Relief", "Refugee Support", "Hospital Visits"],
  other: ["Board Games", "Chess", "Coffee", "Gaming", "Book", "Karaoke", "Astronomy", "Origami", "Model UN"],
};

const CLUB_FORMS = [
  "{topic} Society",
  "{topic} Club",
  "{topic} Collective",
  "{topic} Guild",
  "{topic} Circle",
  "The {topic} Society",
  "{topic} Union",
  "{topic} Network",
];

const CATEGORY_BLURB = {
  academic: "academic discussion and competition",
  arts: "creative practice and performance",
  career: "professional development and industry contact",
  cultural: "cultural exchange and community",
  environment: "environmental action on and around campus",
  media: "student journalism and media production",
  sports: "recreational and competitive sport",
  technology: "hands-on technology and engineering",
  volunteering: "volunteering in the wider community",
  other: "shared interests and low-stakes socials",
};

const MEMBERSHIP_MESSAGES = [
  "I came to one session and would like to keep coming.",
  "Interested in the projects, not just the socials.",
  "First-year student — is there space for a beginner?",
  "I have some experience from school and would like to help organise.",
  "Looking for a group to work with regularly.",
  "A friend recommended this club, I would like to join.",
];

const ANNOUNCEMENTS = [
  { title: "Room change for this week", body: "We are in the east seminar room instead of the usual lab. Same time, same door code." },
  { title: "Sign-ups for the spring team are open", body: "If you want to be on the organising team next term, reply to the mailing list before Friday. Two places." },
  { title: "Thanks for a great semester", body: "Attendance doubled this term. Coffee and pastries at the last meeting were on us — same again next term." },
  { title: "Equipment inventory", body: "Please return anything borrowed from the shared cupboard before the break. The list is pinned by the door." },
  { title: "New reading list", body: "This term's readings are in the shared drive. No preparation needed for the first session." },
  { title: "Volunteers needed", body: "We need four people to help set up on Thursday afternoon. An hour each, no experience needed." },
  { title: "Budget approved", body: "The student union approved our budget for the year. Details in the minutes, which are in the shared folder." },
  { title: "Joint session with another club", body: "We are co-hosting a session next month. Bring a friend who has never been before." },
];

const PROJECT_TITLES = [
  "Solar charging bench for the courtyard",
  "Campus food garden",
  "Open-source room booking board",
  "Accessibility map of the main buildings",
  "Night bus schedule tracker",
  "Repair café for broken electronics",
  "Student pantry inventory app",
  "Bike repair stand at the north gate",
  "Campus tree survey",
  "Sound level map of the library",
  "Reusable cup deposit scheme",
  "Beginner robotics kit",
  "Peer tutoring matching board",
  "Archive of student publications",
  "Sensor network for the greenhouse",
  "Accessible PDF pipeline for course notes",
  "Community fridge monitoring",
  "Campus bird box project",
  "Digital noticeboard for clubs",
  "Wheelchair route planner",
  "Low-cost air quality sensors",
  "Student-run print studio",
  "Shared tool library",
  "Open data dashboard for timetables",
  "Language exchange matching",
  "Campus history walking tour",
  "Mobile charging cart",
  "Seed library cabinet",
  "Event sign-in kiosk",
  "Quiet room availability display",
  "Rainwater collection prototype",
  "Campus compost pilot",
  "Open hardware lab inventory",
  "Multilingual welcome guide",
  "Sustainable catering guide",
  "Student mental health resources map",
  "Solar kiosk for the sports field",
  "Bike-sharing app for campus",
  "Biodegradable packaging trial",
  "Campus mural restoration",
  "Peer note-sharing archive",
  "Evening study space finder",
  "Library noise alert system",
  "Sports equipment lending desk",
  "Community garden irrigation timer",
  "Open syllabus archive",
];

const PROJECT_ADJECTIVES = ["Open", "Community", "Student-led", "Low-cost", "Shared", "Neighbourhood", "Solar", "Modular", "Accessible", "Repairable"];
const PROJECT_NOUNS = ["toolkit", "platform", "workshop", "experiment", "prototype", "library", "guide", "network", "map", "cabinet"];

const PROJECT_CATEGORIES = ["software", "robotics", "research", "volunteering", "gardening", "creative", "campus-improvement", "entrepreneurship", "other"];

const ROLE_TITLES = [
  "Frontend developer", "Backend developer", "Designer", "Hardware tinkerer", "Field researcher",
  "Community organiser", "Translator", "Photographer", "Data analyst", "QA and testing",
  "Workshop facilitator", "Writer",
];

const TASK_TITLES = [
  "Order the first batch of parts", "Draft the project brief", "Book the workshop for Thursday",
  "Photograph the prototype", "Write the safety notes", "Set up the shared drive",
  "Talk to the facilities office", "Prepare the demo for the open day", "Review the budget",
  "Collect feedback from the pilot group", "Update the build instructions",
];

const MILESTONE_TITLES = [
  "Prototype ready", "First field test", "Safety review", "Public demo", "Handover documentation", "Phase 2 funding",
];

const EVENT_FORMATS = [
  "workshop", "night", "demo", "talk", "meetup", "tournament", "jam", "screening",
  "open mic", "field trip", "hackathon", "panel", "social", "training session",
];

const VENUES = [
  ["Student Union Hall", "Student Union, ground floor"],
  ["Engineering Building, Room E2", "Engineering Building, second floor"],
  ["Library Seminar Room", "Main Library, first floor"],
  ["The Workshop", "Engineering Building, basement"],
  ["North Campus Amphitheatre", "North Campus, outdoors"],
  ["Science Block Auditorium", "Science Block, entrance B"],
  ["Canteen Mezzanine", "Main Canteen, mezzanine"],
  ["Sports Hall", "Sports Centre, north entrance"],
  ["Design Studio", "Arts Building, third floor"],
  ["Greenhouse", "Botanical Garden, east gate"],
  ["Lecture Theatre 4", "Main Building, first floor"],
  ["Community Room", "Student Residence C, ground floor"],
];

const EVENT_DESCRIPTIONS = [
  "Doors open fifteen minutes early. No experience or preparation is required — everything you need is provided, and you can leave with the group or stay to help tidy up.",
  "The session is run by students for students. Bring a laptop if you have one; a small number of loan devices are available on the day.",
  "We will start with a short introduction for newcomers, then split into smaller groups so everyone gets hands-on time.",
  "Accessibility: step-free access is available and the room has an induction loop. Tell us anything else you need when you register and we will arrange it.",
  "This is a relaxed event. Cameras and photography are not used without asking first, and there is a quiet corner if you need a break.",
  "Places are limited to keep the group workable. If it fills up, join the waitlist — we release places as people's plans change, and the waitlist is first come, first served.",
  "Expect a mix of demonstration, discussion and practice. The session ends with an open floor for questions and next steps.",
  "We finish on time. Afterwards a smaller group usually walks to the canteen together, which is optional and not part of the programme.",
];

const FEEDBACK_COMMENTS = [
  "Well organised, and the pace was right for a beginner.",
  "Good session. More time for the hands-on part next time would help.",
  "Loved it. The organisers were welcoming and answered every question.",
  "Useful, but the room was a bit crowded. Move it somewhere larger.",
  "Exactly what I needed before the exam period.",
  "Would come again. The follow-up notes in the mailing list were a nice touch.",
  "Arrived late and still felt welcome, which is rare.",
  "The project demo was the highlight.",
];

const MODERATION_REASONS = [
  "Spam link in an announcement",
  "Event description reads as a commercial advertisement",
  "Inappropriate image on a club profile",
  "Harassment in a project application message",
  "Duplicate club created for the same group",
  "Misleading venue information on an event",
];

const API_ROUTES = [
  "/api/v1/clubs", "/api/v1/events", "/api/v1/projects", "/api/v1/search",
  "/api/health/ready", "/clubs", "/events", "/projects", "/search", "/rss.xml",
];

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 110)
    .replace(/-+$/g, "");
}

function emailFor(first, last, index) {
  const clean = (value) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  return `${clean(first)}.${clean(last)}.${String(index).padStart(4, "0")}@students.example.edu`;
}

const daysAgo = (days, hour = 18) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
};
const daysAhead = (days, hour = 18) => daysAgo(-days, hour);

function clampText(value, max) {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

async function insertMany(client, table, columns, rows, batchSize = 400) {
  if (rows.length === 0) return;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const slice = rows.slice(offset, offset + batchSize);
    const params = [];
    const tuples = slice.map((row, rowIndex) => {
      const placeholders = row.map((_, columnIndex) => {
        params.push(row[columnIndex]);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });
      return `(${placeholders.join(",")})`;
    });
    await client.query(`insert into ${table} (${columns.join(",")}) values ${tuples.join(",")}`, params);
  }
}

/* ------------------------------------------------------------------ */
/* Generation                                                         */
/* ------------------------------------------------------------------ */

const started = Date.now();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("set statement_timeout = '180s'");

const step = (message) => console.log(`• ${message}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);

try {
  const existing = await client.query("select value from settings where key = 'demo'");
  if (existing.rows.length > 0 && !config.reset) {
    console.error(
      "Demo data is already present. Nothing was changed.\n" +
        "Run with --reset to replace it (local databases only).",
    );
    await client.end();
    process.exit(0);
  }

  await client.query("begin");

  if (config.reset) {
    step("clearing previous demo content");
    await client.query(`
      truncate table
        media_assets, attendance_tokens, event_feedback, event_registrations, event_organizers,
        events, project_updates, project_milestones, project_tasks, project_applications,
        project_members, project_roles, projects, announcements, club_memberships, clubs,
        notifications, moderation_reports, outbound_emails, jobs, api_metrics,
        rate_limit_counters, sessions, sign_in_tickets, oauth_states, users
      restart identity cascade`);
    // `truncate users ... cascade` reaches `settings` too (it references users),
    // which would silently remove the defaults the app reads at runtime.
    await client.query(`
      insert into settings (key, value) values
        ('maintenance', '{"enabled": false, "message": null}'::jsonb),
        ('registration', '{"devSignInEnabled": true}'::jsonb)
      on conflict (key) do nothing`);
  }

  /* ---------------- people ---------------- */

  // The four documented demo accounts stay available in development, because the
  // README and the sign-in page name them. They are skipped on a production
  // database, where development sign-in is refused anyway.
  const accounts = [];
  if (!isProduction) {
    accounts.push(
      { email: "admin@campussphere.local", name: "Nour Admin", roles: "{student,super_admin}" },
      { email: "officer@campussphere.local", name: "Amira Officer", roles: "{student}" },
      { email: "lead@campussphere.local", name: "Yassine Lead", roles: "{student}" },
      { email: "student@campussphere.local", name: "Sami Student", roles: "{student}" },
    );
  }
  for (let i = 1; i <= 4; i += 1) {
    accounts.push({
      email: `moderator${i}@students.example.edu`,
      name: `${FIRST_NAMES[i * 7]} ${LAST_NAMES[i * 5]}`,
      roles: "{student,moderator}",
    });
  }

  const users = [];
  const usedEmails = new Set(accounts.map((account) => account.email));

  for (const account of accounts) {
    const createdAt = daysAgo(int(500, 900));
    users.push({
      id: randomUUID(),
      email: account.email,
      name: account.name,
      roles: account.roles,
      createdAt,
      lastSeen: daysAgo(int(0, 3)),
      bio: null,
      avatar: null,
      status: "active",
    });
    usedEmails.add(account.email);
  }

  for (let i = 1; i <= config.users; i += 1) {
    const first = FIRST_NAMES[(i * 7 + int(0, 5)) % FIRST_NAMES.length];
    const last = LAST_NAMES[(i * 13 + int(0, 9)) % LAST_NAMES.length];
    let email = emailFor(first, last, i);
    while (usedEmails.has(email)) email = emailFor(first, last, i + config.users);
    usedEmails.add(email);

    const major = pick(MAJORS);
    const suspended = chance(0.006);
    users.push({
      id: randomUUID(),
      email,
      name: `${first} ${last}`,
      roles: "{student}",
      createdAt: daysAgo(int(0, 730)),
      lastSeen: chance(0.75) ? daysAgo(int(0, 21), int(8, 23)) : null,
      bio: chance(0.55)
        ? clampText(pick(BIOS).replace("{major}", major).replace("{year}", String(2026 + int(0, 2))), 400)
        : null,
      avatar: chance(0.3) ? `https://i.pravatar.cc/96?u=${encodeURIComponent(email)}` : null,
      status: suspended ? "suspended" : "active",
    });
  }

  await insertMany(
    client,
    "users",
    ["id", "email", "email_verified", "name", "avatar_url", "bio", "roles", "status", "created_at", "last_seen_at"],
    users.map((user) => [
      user.id, user.email, true, user.name, user.avatar, user.bio, user.roles, user.status,
      user.createdAt, user.lastSeen,
    ]),
  );
  step(`${users.length} people`);

  const admin = users.find((user) => user.email === "admin@campussphere.local") ?? users[0];
  const activeUsers = users.filter((user) => user.status === "active");

  /* ---------------- clubs ---------------- */

  const clubs = [];
  const usedSlugs = new Set();

  // Build every candidate name first, then take a shuffled slice. Iterating
  // category by category would spend the whole budget on the first two
  // categories — the catalogue would have no robotics club and no sports team.
  const candidates = [];
  for (const [category, topics] of Object.entries(CLUB_TOPICS)) {
    for (const form of CLUB_FORMS) {
      for (const topic of topics) {
        const name = form.replace("{topic}", topic);
        const slug = slugify(name);
        if (usedSlugs.has(slug)) continue;
        usedSlugs.add(slug);
        candidates.push({ name, slug, category, topic });
      }
    }
  }

  for (const candidate of pickSome(candidates, Math.min(config.clubs, candidates.length))) {
    const { name, slug, category, topic } = candidate;
    const topicLower = topic.toLowerCase();
    const tagline = pick([
      `For everyone curious about ${topicLower}.`,
      `${topic} on campus, without the pressure.`,
      `Meet people who take ${topicLower} seriously — and not too seriously.`,
      `A student-run home for ${topicLower}.`,
      `Weekly sessions, open doors, no experience required.`,
    ]);
    const description =
      `${name} is a student-run club for ${CATEGORY_BLURB[category]}. ` +
      `We meet every ${pick(["Monday", "Tuesday", "Wednesday", "Thursday"])} evening during term, ` +
      `and our sessions mix hands-on practice with short talks from members. ` +
      `The club exists because ${topicLower} is better with other people around: ` +
      `beginners get paired with someone more experienced, and nobody is expected to arrive already knowing the ropes. ` +
      `We coordinate through the announcements on this page and a mailing list that is open to anyone who has joined. ` +
      `If you are unsure whether it is for you, come to one session and decide afterwards.`;

    clubs.push({
      id: randomUUID(),
      slug,
      name,
      tagline,
      description,
      category,
      verified: chance(0.32),
      logo: null,
      cover: chance(0.3) ? `https://picsum.photos/seed/${slug}/1200/600` : null,
      website: chance(0.18) ? `https://${slug}.example.edu` : null,
      contact: `${slug}@clubs.example.edu`,
      instagram: chance(0.25) ? `https://instagram.com/${slug.replace(/-/g, "")}` : null,
      policy: chance(0.5) ? "open" : chance(0.8) ? "request" : "invite",
      createdAt: daysAgo(int(20, 700), int(9, 20)),
      topic,
      officers: [],
    });
  }

  await insertMany(
    client,
    "clubs",
    ["id", "slug", "name", "tagline", "description", "category", "status", "verified", "logo_url",
      "cover_url", "website_url", "contact_email", "instagram_url", "membership_policy", "created_by", "created_at"],
    clubs.map((club) => [
      club.id, club.slug, club.name, club.tagline, club.description, club.category, "active",
      club.verified, club.logo, club.cover, club.website, club.contact, club.instagram, club.policy,
      admin.id, club.createdAt,
    ]),
  );
  step(`${clubs.length} clubs`);

  /* ---------------- memberships and announcements ---------------- */

  const memberships = [];
  const announcements = [];
  const membershipDecidedAt = () => daysAgo(int(1, 500));

  for (const club of clubs) {
    const totalMembers = Math.min(activeUsers.length - 1, int(8, 140));
    const pendingCount = int(0, 8);
    const indices = sampleIndices(activeUsers.length, totalMembers + pendingCount);
    const chosen = indices.map((index) => activeUsers[index]);

    // The first three become the officer team; the first is the president.
    const [president, officerA, officerB] = chosen.slice(0, 3);
    for (const [position, member] of [president, officerA, officerB].entries()) {
      const role = position === 0 ? "president" : "officer";
      memberships.push([
        randomUUID(), club.id, member.id, role, "active", null, admin.id,
        membershipDecidedAt(), daysAgo(int(200, 700), int(9, 18)), membershipDecidedAt(),
      ]);
      club.officers.push(member);
    }

    for (const member of chosen.slice(3, 3 + totalMembers)) {
      memberships.push([
        randomUUID(), club.id, member.id, "member", "active", null, president.id,
        membershipDecidedAt(), daysAgo(int(1, 600), int(8, 22)), membershipDecidedAt(),
      ]);
    }

    // Pending requests keep the officer review queues populated.
    for (const applicant of chosen.slice(3 + totalMembers)) {
      memberships.push([
        randomUUID(), club.id, applicant.id, "member", "pending", pick(MEMBERSHIP_MESSAGES), null,
        null, daysAgo(int(0, 25), int(8, 23)), daysAgo(int(0, 25), int(8, 23)),
      ]);
    }

    for (let i = 0; i < int(0, 4); i += 1) {
      const announcement = pick(ANNOUNCEMENTS);
      announcements.push([
        randomUUID(), club.id, pick(club.officers).id, announcement.title, announcement.body,
        chance(0.2), daysAgo(int(0, 180), int(9, 21)),
      ]);
    }
  }

  await insertMany(
    client,
    "club_memberships",
    ["id", "club_id", "user_id", "role", "status", "message", "decided_by", "decided_at", "created_at", "updated_at"],
    memberships,
  );
  await insertMany(
    client,
    "announcements",
    ["id", "club_id", "author_id", "title", "body", "pinned", "published_at"],
    announcements,
  );
  step(`${memberships.length} memberships, ${announcements.length} announcements`);

  /* ---------------- projects ---------------- */

  const projects = [];
  const projectRoles = [];
  const projectMembers = [];
  const projectApplications = [];
  const projectTasks = [];
  const projectMilestones = [];
  const projectUpdates = [];
  const usedProjectSlugs = new Set();
  const submittedProjects = Math.max(4, Math.round(config.projects * 0.12));

  for (let i = 0; i < config.projects; i += 1) {
    const baseTitle = i < PROJECT_TITLES.length
      ? PROJECT_TITLES[i]
      : `${pick(PROJECT_ADJECTIVES)} ${pick(PROJECT_NOUNS)} for ${pick(["the courtyard", "the library", "first-years", "the north gate", "the sports hall", "the design studio"])}`;
    const title = i < PROJECT_TITLES.length ? baseTitle : `${baseTitle} (${Math.floor(i / PROJECT_TITLES.length) + 1})`;
    let slug = slugify(title);
    let suffix = 2;
    while (usedProjectSlugs.has(slug)) slug = `${slugify(title)}-${suffix++}`;
    usedProjectSlugs.add(slug);

    const club = chance(0.65) ? pick(clubs) : null;
    const lead = club && club.officers.length > 0 && chance(0.6) ? pick(club.officers) : pick(activeUsers);
    const isSubmitted = i < submittedProjects;
    const isDraft = !isSubmitted && chance(0.04);
    const status = isSubmitted ? "submitted" : isDraft ? "draft" : "approved";
    const createdAt = daysAgo(int(10, 600), int(9, 20));
    const submittedAt = status === "draft" ? null : daysAgo(int(1, 400), int(9, 20));
    const approvedAt = status === "approved" ? daysAgo(int(0, 300), int(9, 20)) : null;

    const summary = clampText(
      pick([
        `A student team turning ${title.toLowerCase()} into something the whole campus can use.`,
        `Hands-on work on ${title.toLowerCase()}, from first sketch to something that survives a semester.`,
        `An open project about ${title.toLowerCase()}. We document everything so the next team can continue.`,
        `${title} — built by students, maintained by students, and open to anyone who wants to help.`,
      ]),
      300,
    );

    projects.push({
      id: randomUUID(),
      slug,
      clubId: club?.id ?? null,
      leadId: lead.id,
      title,
      summary,
      description:
        `${summary}\n\n` +
        `Why: the campus has a version of this problem that is small enough to fix in a term but real enough to matter. ` +
        `We started by talking to the people who would use it and writing down what they actually asked for.\n\n` +
        `How we work: short weekly meetings, tasks on the project board, and a rule that every decision is written down. ` +
        `Nobody is expected to commit more than a few hours a week, and we do not disappear during exam periods.\n\n` +
        `Where we are: ${pick(["sketch", "first prototype", "field testing", "a working v1 that needs polish", "documentation and handover"])}. ` +
        `New contributors are welcome at any stage — the open roles on this page describe what we need most right now.`,
      category: pick(PROJECT_CATEGORIES),
      status,
      visibility: chance(0.96) ? "public" : "members",
      goals: "Ship something usable this academic year, and leave documentation good enough for the next team.",
      impact: pick([
        "A few hundred students per term, if we get the details right.",
        "Small at first: one building, one pilot group, one honest report.",
        "Longer term, this becomes shared infrastructure the university does not have to pay for.",
      ]),
      timeline: pick(["Two terms, part time.", "One semester for the pilot, then review.", "Rolling, with a demo at the end of each term."]),
      resources: pick(["Student union micro-grant, plus the workshop.", "No budget yet — materials from the lab surplus.", "Funded for the pilot; we publish the receipts."]),
      cover: chance(0.3) ? `https://picsum.photos/seed/${slug}/1200/600` : null,
      createdAt,
      submittedAt,
      approvedAt,
      decidedAt: approvedAt,
      decidedBy: approvedAt ? admin.id : null,
    });

    const roleCount = int(1, 3);
    const roles = [];
    for (const roleTitle of pickSome(ROLE_TITLES, roleCount)) {
      const roleId = randomUUID();
      roles.push({ id: roleId, title: roleTitle, slots: int(1, 4) });
      projectRoles.push([roleId, projects.at(-1).id, roleTitle, `${roleTitle} for ${title.toLowerCase()}.`, roles.at(-1).slots, createdAt]);
    }

    const team = sampleIndices(activeUsers.length, int(2, 10))
      .map((index) => activeUsers[index])
      .filter((member) => member.id !== lead.id);
    projectMembers.push([randomUUID(), projects.at(-1).id, lead.id, "lead", createdAt]);
    for (const member of team) {
      projectMembers.push([randomUUID(), projects.at(-1).id, member.id, "member", daysAgo(int(0, 300), int(9, 20))]);
    }

    for (const applicant of sampleIndices(activeUsers.length, int(0, 6))
      .map((index) => activeUsers[index])
      .filter((applicant) => applicant.id !== lead.id)) {
      const isPending = chance(0.28);
      const role = pick(roles);
      projectApplications.push([
        randomUUID(), projects.at(-1).id, role.id, applicant.id,
        pick([
          "I would like to help with the build and can commit two evenings a week.",
          "I have done something similar in a course project and would like to continue.",
          "Mostly interested in the documentation and testing side.",
          "Happy to do the boring parts — scheduling, notes, follow-up.",
          "I can help with design and photography for the updates.",
        ]),
        isPending ? "pending" : pick(["accepted", "declined", "withdrawn"]),
        isPending ? null : lead.id,
        isPending ? null : daysAgo(int(0, 100), int(9, 20)),
        daysAgo(int(0, 200), int(9, 22)),
      ]);
    }

    for (const titleText of pickSome(TASK_TITLES, int(2, 6))) {
      projectTasks.push([
        randomUUID(), projects.at(-1).id, titleText, null,
        pick(["todo", "todo", "doing", "done"]), pick(team).id,
        daysAhead(int(1, 40)), lead.id, daysAgo(int(0, 60), int(9, 20)), daysAgo(int(0, 20), int(9, 20)),
      ]);
    }
    for (const milestoneTitle of pickSome(MILESTONE_TITLES, int(1, 4))) {
      const done = chance(0.35);
      projectMilestones.push([
        randomUUID(), projects.at(-1).id, milestoneTitle, null,
        done ? daysAgo(int(5, 90)) : daysAhead(int(5, 90)),
        done ? daysAgo(int(1, 80)) : null, daysAgo(int(0, 120), int(9, 20)),
      ]);
    }
    for (let update = 0; update < int(0, 3); update += 1) {
      projectUpdates.push([
        randomUUID(), projects.at(-1).id, lead.id,
        pick(["Weekly update", "Prototype notes", "What we learned testing it", "Next steps"]),
        pick([
          "Two steps forward, one back. The parts arrived and the first assembly fits, but the bracket needs a redesign.",
          "We ran the pilot with twelve people and wrote down every point of confusion. Three of them are fixable this week.",
          "Documentation is now in the shared folder, including the mistakes. Please read it before ordering anything.",
          "We are pausing over the exam period and restarting on the first Tuesday after.",
        ]),
        daysAgo(int(0, 90), int(10, 20)),
      ]);
    }
  }

  await insertMany(
    client,
    "projects",
    ["id", "slug", "club_id", "lead_id", "title", "summary", "description", "category", "status",
      "visibility", "goals", "expected_impact", "timeline", "resources", "cover_url", "decided_by",
      "decided_at", "submitted_at", "approved_at", "created_at"],
    projects.map((project) => [
      project.id, project.slug, project.clubId, project.leadId, project.title, project.summary,
      project.description, project.category, project.status, project.visibility, project.goals,
      project.impact, project.timeline, project.resources, project.cover, project.decidedBy,
      project.decidedAt, project.submittedAt, project.approvedAt, project.createdAt,
    ]),
  );
  await insertMany(client, "project_roles", ["id", "project_id", "title", "description", "slots", "created_at"], projectRoles);
  await insertMany(client, "project_members", ["id", "project_id", "user_id", "role", "joined_at"], projectMembers);
  await insertMany(
    client,
    "project_applications",
    ["id", "project_id", "role_id", "user_id", "message", "status", "decided_by", "decided_at", "created_at"],
    projectApplications,
  );
  await insertMany(
    client,
    "project_tasks",
    ["id", "project_id", "title", "description", "status", "assignee_id", "due_date", "created_by", "created_at", "updated_at"],
    projectTasks,
  );
  await insertMany(
    client,
    "project_milestones",
    ["id", "project_id", "title", "description", "due_date", "completed_at", "created_at"],
    projectMilestones,
  );
  await insertMany(
    client,
    "project_updates",
    ["id", "project_id", "author_id", "title", "body", "created_at"],
    projectUpdates,
  );
  step(`${projects.length} projects, ${projectApplications.length} applications, ${projectTasks.length} tasks`);

  /* ---------------- events ---------------- */

  const events = [];
  const usedEventSlugs = new Set();
  const upcomingCount = Math.round(config.events * 0.62);
  const reviewQueue = Math.max(4, Math.round(config.events * 0.03));

  for (let i = 0; i < config.events; i += 1) {
    const club = pick(clubs);
    const topic = club.topic;
    const format = pick(EVENT_FORMATS);
    const titleBase = `${topic} ${format}`.replace(/\b\w/g, (letter) => letter.toUpperCase());
    const title = chance(0.5) ? titleBase : `${titleBase}: ${pick(["beginners welcome", "open session", "part two", "spring edition", "with guests", "drop in"])}`;
    let slug = slugify(title);
    let suffix = 2;
    while (usedEventSlugs.has(slug)) slug = `${slugify(title)}-${suffix++}`;
    usedEventSlugs.add(slug);

    const upcoming = i < upcomingCount;
    const inReview = i >= upcomingCount && i < upcomingCount + reviewQueue;
    const dayOffset = upcoming ? int(0, 120) : -int(2, 320);
    const hour = pick([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    const startsAt = dayOffset >= 0 ? daysAhead(dayOffset, hour) : daysAgo(-dayOffset, hour);
    const endsAt = new Date(startsAt.getTime() + int(1, 4) * 60 * 60 * 1000);
    const online = chance(0.18);
    const [venueName, venueAddress] = pick(VENUES);
    const capacity = chance(0.25) ? null : int(12, 240);

    const cancelled = !inReview && upcoming && chance(0.03);
    const status = inReview
      ? "submitted"
      : upcoming
        ? cancelled
          ? "cancelled"
          : "published"
        : chance(0.85)
          ? "completed"
          : "published";

    const summary = clampText(
      pick([
        `A ${format} for anyone curious about ${topic.toLowerCase()} — beginners welcome, materials provided.`,
        `Join ${club.name} for an evening of ${topic.toLowerCase()}, questions and probably snacks.`,
        `${club.name} opens its doors: short talks, hands-on time and a chance to meet the team.`,
        `An informal ${format} about ${topic.toLowerCase()}, run by students for students.`,
      ]),
      300,
    );

    events.push({
      id: randomUUID(),
      slug,
      clubId: club.id,
      createdBy: pick(club.officers).id,
      title,
      summary,
      description:
        `${summary}\n\n${pick(EVENT_DESCRIPTIONS)}\n\n${pick(EVENT_DESCRIPTIONS)}\n\n` +
        `Organised by ${club.name}. Questions go to ${club.contact}.`,
      category: pick(["academic", "arts", "career", "community", "competition", "cultural", "environment", "sports", "technology", "other"]),
      status,
      startsAt,
      endsAt,
      venueName: online ? null : venueName,
      venueAddress: online ? null : venueAddress,
      onlineUrl: online ? `https://meet.example.edu/${slug}` : null,
      capacity,
      accessibility: chance(0.4)
        ? "Step-free access from the north entrance; ask at the desk for the lift key. Induction loop in the main room."
        : null,
      cover: chance(0.35) ? `https://picsum.photos/seed/${slug}/1200/600` : null,
      createdAt: new Date(startsAt.getTime() - int(3, 60) * 86_400_000),
      publishedAt: status === "published" || status === "completed" ? new Date(startsAt.getTime() - int(2, 30) * 86_400_000) : null,
      submittedAt: status === "submitted" ? daysAgo(int(0, 10)) : null,
      cancelledAt: status === "cancelled" ? daysAgo(int(0, 20)) : null,
      cancellationReason: status === "cancelled" ? "The venue became unavailable. We are looking for a new date." : null,
      officers: club.officers,
    });
  }

  await insertMany(
    client,
    "events",
    ["id", "slug", "club_id", "created_by", "title", "summary", "description", "category", "status",
      "starts_at", "ends_at", "timezone", "venue_name", "venue_address", "online_url", "capacity",
      "waitlist_enabled", "accessibility_notes", "contact_email", "cover_url", "decision_notes",
      "decided_by", "decided_at", "submitted_at", "published_at", "cancelled_at", "cancellation_reason", "created_at"],
    events.map((event) => [
      event.id, event.slug, event.clubId, event.createdBy, event.title, event.summary, event.description,
      event.category, event.status, event.startsAt, event.endsAt, "UTC", event.venueName,
      event.venueAddress, event.onlineUrl, event.capacity, true, event.accessibility, null, event.cover,
      null, event.publishedAt ? admin.id : null, event.publishedAt, event.submittedAt, event.publishedAt,
      event.cancelledAt, event.cancellationReason, event.createdAt,
    ]),
  );
  step(`${events.length} events`);

  /* ---------------- registrations, attendance, feedback ---------------- */

  const organizers = [];
  const registrations = [];
  const feedback = [];
  const now = Date.now();

  for (const event of events) {
    for (const officer of pickSome(event.officers, Math.min(event.officers.length, int(1, 3)))) {
      organizers.push([event.id, officer.id, event.createdAt]);
    }

    const isPast = event.endsAt.getTime() < now;
    if (event.status === "submitted" || event.status === "cancelled") continue;

    // Skewed rather than uniform: a handful of sold-out events and many quiet
    // ones is what a real campus calendar looks like, and it exercises both the
    // "places left" and the waitlist paths.
    const ceiling = Math.min(event.capacity ?? 120, 120);
    const wanted = Math.floor(Math.pow(random(), 1.6) * ceiling);
    const seats = event.capacity === null ? wanted : Math.min(wanted, event.capacity);
    const waitlisted = event.capacity === null ? 0 : Math.max(0, wanted - seats);
    const attendees = sampleIndices(activeUsers.length, seats + waitlisted);

    attendees.forEach((index, position) => {
      const user = activeUsers[index];
      if (position < seats) {
        const status = isPast ? (chance(0.78) ? "attended" : "no_show") : "registered";
        registrations.push([
          randomUUID(), event.id, user.id, status, null,
          new Date(event.startsAt.getTime() - int(1, 25) * 86_400_000),
          new Date(event.startsAt.getTime() - int(0, 1) * 86_400_000),
          null, null,
        ]);
        if (isPast && status === "attended" && chance(0.3)) {
          feedback.push([
            randomUUID(), event.id, user.id, int(3, 5), chance(0.6) ? pick(FEEDBACK_COMMENTS) : null,
            new Date(event.endsAt.getTime() + int(1, 72) * 3_600_000),
          ]);
        }
      } else {
        registrations.push([
          randomUUID(), event.id, user.id, "waitlisted", position - seats + 1,
          new Date(event.startsAt.getTime() - int(1, 20) * 86_400_000),
          new Date(event.startsAt.getTime() - int(0, 1) * 86_400_000),
          null, null,
        ]);
      }
    });
  }

  await insertMany(client, "event_organizers", ["event_id", "user_id", "added_at"], organizers);
  await insertMany(
    client,
    "event_registrations",
    ["id", "event_id", "user_id", "status", "position", "created_at", "updated_at", "cancelled_at", "promoted_from_waitlist_at"],
    registrations,
  );
  await insertMany(
    client,
    "event_feedback",
    ["id", "event_id", "user_id", "rating", "comment", "created_at"],
    feedback,
  );
  step(`${registrations.length} registrations, ${feedback.length} feedback entries`);

  /* ---------------- operational surfaces ---------------- */

  const notifications = [];
  for (let i = 0; i < 5000; i += 1) {
    const user = pick(activeUsers);
    const kind = pick([
      "event_registration_confirmed", "event_reminder", "announcement",
      "project_application_received", "club_application_decided", "system",
    ]);
    notifications.push([
      randomUUID(), user.id, kind,
      kind === "event_reminder"
        ? "An event you registered for starts soon"
        : kind === "announcement"
          ? pick(["New announcement from your club", "Room change for this week", "Sign-ups are open"])
          : pick(["You are registered", "Your application was received", "A decision was made", "Welcome to CampusSphere"]),
      pick([
        "Details are on the event page. You can cancel your place from your dashboard.",
        "An organiser updated the information. Check the page before you travel.",
        "No action is needed if you have already seen this.",
        "You can change your notification preferences from your profile.",
      ]),
      pick(["/events", "/dashboard", "/dashboard/notifications", "/clubs"]),
      chance(0.6) ? daysAgo(int(0, 20), int(8, 22)) : null,
      daysAgo(int(0, 40), int(8, 23)),
    ]);
  }
  await insertMany(
    client,
    "notifications",
    ["id", "user_id", "kind", "title", "body", "link", "read_at", "created_at"],
    notifications,
  );

  const reports = [];
  const reportTargets = [
    ...clubs.slice(0, 60).map((club) => ["club", club.id, club.name]),
    ...projects.slice(0, 60).map((project) => ["project", project.id, project.title]),
    ...events.slice(0, 60).map((event) => ["event", event.id, event.title]),
    ...activeUsers.slice(0, 40).map((user) => ["user", user.id, user.name]),
  ];
  for (const [targetType, targetId, label] of pickSome(reportTargets, 70)) {
    const status = pick(["open", "open", "under_review", "resolved", "dismissed"]);
    reports.push([
      randomUUID(), pick(activeUsers).id, targetType, targetId, label, pick(MODERATION_REASONS),
      chance(0.5) ? "Reported by a member; seen more than once on the public page." : null,
      status,
      status === "resolved" || status === "dismissed" ? admin.id : null,
      status === "resolved" || status === "dismissed" ? daysAgo(int(0, 30)) : null,
      status === "resolved" ? "Reviewed and corrected by the owner." : status === "dismissed" ? "No policy breach found." : null,
      daysAgo(int(0, 60), int(8, 22)),
    ]);
  }
  await insertMany(
    client,
    "moderation_reports",
    ["id", "reporter_id", "target_type", "target_id", "target_label", "reason", "details", "status",
      "resolved_by", "resolved_at", "resolution_notes", "created_at"],
    reports,
  );

  const metrics = [];
  for (let i = 0; i < 5000; i += 1) {
    const route = pick(API_ROUTES);
    const status = chance(0.9) ? pick([200, 200, 200, 304]) : pick([404, 404, 429, 500, 503]);
    const base = route.startsWith("/api/v1") ? 45 : 120;
    metrics.push([
      route, "GET", status,
      Math.max(4, Math.round(base * (0.4 + random() * 2.6))),
      new Date(Date.now() - int(0, 60) * 60_000 - int(0, 59) * 1000),
    ]);
  }
  await insertMany(client, "api_metrics", ["route", "method", "status_code", "duration_ms", "created_at"], metrics);

  const jobs = [];
  for (let i = 0; i < 80; i += 1) {
    const status = pick(["done", "done", "done", "queued", "running", "failed"]);
    jobs.push([
      randomUUID(), pick(["email", "event_reminder", "cleanup_metrics", "media_reconcile"]),
      JSON.stringify({ demo: true }), daysAgo(int(0, 5), int(0, 23)), status === "failed" ? 2 : 1, 5,
      status, status === "failed" ? "SMTP timeout after 10s" : null,
      status === "running" ? "worker-1" : null, status === "running" ? daysAgo(0, 12) : null,
      daysAgo(int(0, 6), int(0, 23)), status === "done" || status === "failed" ? daysAgo(int(0, 4), int(0, 23)) : null,
    ]);
  }
  await insertMany(
    client,
    "jobs",
    ["id", "kind", "payload", "run_at", "attempts", "max_attempts", "status", "last_error",
      "locked_by", "locked_at", "created_at", "finished_at"],
    jobs,
  );

  await client.query(
    `insert into settings (key, value, updated_by) values ('demo', $1::jsonb, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [
      JSON.stringify({
        seeded: true,
        at: new Date().toISOString(),
        seed: config.seed,
        counts: {
          users: users.length,
          clubs: clubs.length,
          memberships: memberships.length,
          projects: projects.length,
          events: events.length,
          registrations: registrations.length,
        },
      }),
      admin.id,
    ],
  );

  await client.query("commit");

  const counts = await client.query(`
    select
      (select count(*) from users)::int as users,
      (select count(*) from clubs)::int as clubs,
      (select count(*) from club_memberships where status = 'active')::int as memberships,
      (select count(*) from projects where status = 'approved')::int as projects,
      (select count(*) from events where status = 'published' and starts_at > now())::int as upcoming_events,
      (select count(*) from events where status in ('published','completed') and ends_at < now())::int as past_events,
      (select count(*) from event_registrations)::int as registrations`);

  console.log("\nSeeded:");
  for (const [key, value] of Object.entries(counts.rows[0])) {
    console.log(`  ${key.padEnd(18)} ${String(value).padStart(7)}`);
  }
  console.log(`\nIn ${((Date.now() - started) / 1000).toFixed(1)}s. Sign in with any seeded address using development sign-in.`);
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error("\nSeeding failed and was rolled back:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
