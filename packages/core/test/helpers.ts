import { randomUUID } from "node:crypto";
import { query } from "../src/db";
import { createSession, devSignIn, type Me } from "../src/auth";

/**
 * Destructive guard at the point of destruction, not only in the global setup.
 * Running a single test file from the repository root (for example
 * `npx vitest run packages/core/test/media.test.ts`) skips
 * `packages/core/vitest.config.ts`, so the setup file that points at the test
 * database never runs and the suite would otherwise truncate the development
 * database. This check makes that mistake loud instead of expensive.
 */
function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  const database = url.split("/").pop()?.split("?")[0] ?? "";
  if (!database.endsWith("_test")) {
    throw new Error(
      `Refusing to truncate "${database || "<unset>"}": integration tests only run against a database whose name ends in _test. ` +
        "Run them with `npm test --workspace @campussphere/core` (or `npm test` from the repository root).",
    );
  }
}

export async function resetDb(): Promise<void> {
  assertTestDatabase();
  await query(`
    truncate table
      api_metrics, outbound_emails, jobs, rate_limit_counters, notifications,
      media_assets, moderation_reports, event_feedback, attendance_tokens, event_registrations,
      event_organizers, events, project_updates, project_milestones, project_tasks,
      project_applications, project_members, project_roles, projects,
      announcements, club_memberships, clubs, oauth_states, sign_in_tickets,
      sessions, audit_events, users
    restart identity cascade
  `);
}

let emailCounter = 0;

export function freshEmail(prefix = "student"): string {
  emailCounter += 1;
  return `${prefix}.${emailCounter}.${randomUUID().slice(0, 6)}@example.edu`;
}

export async function makeUser(options: {
  roles?: Array<"student" | "moderator" | "super_admin">;
  name?: string;
  email?: string;
} = {}): Promise<Me> {
  const email = options.email ?? freshEmail();
  const result = await query<{ id: string }>(
    `insert into users (email, email_verified, name, avatar_url, roles)
     values ($1, true, $2, null, $3::global_role[]) returning id`,
    [email, options.name ?? "Test Student", options.roles ?? ["student"]],
  );
  const id = result.rows[0]!.id;
  const me = await import("../src/auth").then((auth) => auth.findMeById(id));
  if (!me) throw new Error("failed to create user");
  return me;
}

export async function makeAdmin(): Promise<Me> {
  return makeUser({ roles: ["student", "super_admin"], name: "Super Admin", email: freshEmail("admin") });
}

export async function makeClub(options: { name?: string; policy?: "open" | "request" | "invite" } = {}) {
  const owner = await makeUser({ name: "Club President" });
  const { createClub } = await import("../src/services/clubs");
  const admin = await makeAdmin();
  const club = await createClub(admin, {
    name: options.name ?? `Club ${randomUUID().slice(0, 6)}`,
    description: "A student-run club for testing the platform end to end.",
    category: "technology",
    membershipPolicy: options.policy ?? "request",
  });
  return { club, owner, admin };
}

export async function addClubMember(clubId: string, userId: string, role: "member" | "officer" | "president" = "member") {
  await query(
    `insert into club_memberships (club_id, user_id, role, status, decided_at)
     values ($1,$2,$3,'active', now())`,
    [clubId, userId, role],
  );
}

export async function sessionFor(userId: string) {
  return createSession(userId);
}

export async function devSession(email?: string) {
  return devSignIn({ email: email ?? freshEmail() });
}
