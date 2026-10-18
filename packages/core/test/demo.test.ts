import { describe, expect, it } from "vitest";
import { DEMO_COUNTS, demoSql } from "../src/demo";

/**
 * The demo catalogue is a generated file that a stranger's deployment executes
 * unattended from a URL. These tests are the review it cannot get by eye.
 */
describe("embedded demo catalogue", () => {
  const sql = demoSql();
  const statements = sql.split("\n");

  it("decodes to INSERT statements and nothing else", () => {
    expect(sql.startsWith("INSERT INTO public.users ")).toBe(true);
    const suspicious = statements.filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      return /^(alter|begin|commit|copy|create|delete|drop|grant|insert|revoke|rollback|select|set|truncate|update|vacuum)\b/i.test(
        trimmed,
      ) && !trimmed.startsWith("INSERT INTO ");
    });
    expect(suspicious).toEqual([]);
  });

  it("never creates a super-admin, so the first-run window stays open", () => {
    // Otherwise `?email=` could not promote the real owner afterwards: the route
    // is writable only while no super-admin exists.
    expect(sql).not.toContain("super_admin");
    expect(sql).toContain("{student,moderator}");
  });

  it("has the row counts advertised on the setup page", () => {
    const count = (table: string) => (sql.match(new RegExp(`INSERT INTO public\\.${table} `, "g")) ?? []).length;
    expect(count("users")).toBe(DEMO_COUNTS.users);
    expect(count("clubs")).toBe(DEMO_COUNTS.clubs);
    expect(count("projects")).toBe(DEMO_COUNTS.projects);
    expect(count("events")).toBe(DEMO_COUNTS.events);
    expect(count("event_registrations")).toBe(DEMO_COUNTS.registrations);
    expect(DEMO_COUNTS.users).toBeGreaterThanOrEqual(50);
    expect(DEMO_COUNTS.clubs).toBeGreaterThanOrEqual(10);
  });

  it("inserts parents before children", () => {
    const position = (table: string) => sql.indexOf(`INSERT INTO public.${table} `);
    expect(position("users")).toBeLessThan(position("clubs"));
    expect(position("clubs")).toBeLessThan(position("club_memberships"));
    expect(position("users")).toBeLessThan(position("projects"));
    expect(position("projects")).toBeLessThan(position("project_roles"));
    expect(position("events")).toBeLessThan(position("event_organizers"));
    expect(position("events")).toBeLessThan(position("event_registrations"));
  });

  it("is idempotent on re-run: every statement tolerates an existing row", () => {
    // Multi-line values mean a statement is not one line; compare totals.
    const inserts = (sql.match(/INSERT INTO public\./g) ?? []).length;
    const guarded = (sql.match(/ON CONFLICT DO NOTHING;/g) ?? []).length;
    expect(inserts).toBeGreaterThan(1000);
    expect(guarded).toBe(inserts);
  });

  it("stays small enough to bundle", () => {
    // A megabyte of SQL in every server bundle would be a real cost; the gzipped
    // base64 is what ships, and this is its budget.
    expect(sql.length).toBeGreaterThan(100_000);
    expect(sql.length).toBeLessThan(4_000_000);
  });
});
