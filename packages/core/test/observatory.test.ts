import { describe, expect, it } from "vitest";
import { makeAdmin, makeUser, resetDb } from "./helpers";
import { observatorySnapshot, recordRequestMetric } from "../src/services/observatory";
import { getMaintenanceState, setMaintenanceState, adminOverview } from "../src/services/admin";

describe("observatory honesty rules", () => {
  it("reports measured values and labels what it cannot measure", async () => {
    await resetDb();
    await makeUser();
    await recordRequestMetric({ route: "/events/:slug", method: "GET", statusCode: 200, durationMs: 42 });
    await recordRequestMetric({ route: "/events/:slug", method: "GET", statusCode: 500, durationMs: 91 });

    const snapshot = await observatorySnapshot();
    const users = snapshot.product.find((metric) => metric.key === "users.total");
    expect(users?.value).toBe(1);
    expect(users?.definition.length).toBeGreaterThan(10);
    expect(snapshot.api.requests).toBe(2);
    expect(snapshot.api.errors).toBe(1);
    expect(snapshot.api.p95Ms).not.toBeNull();
    expect(snapshot.database.migrationsApplied).toBeGreaterThan(0);
    expect(snapshot.runtime.nodeVersion).toMatch(/^v\d+/);
    expect(snapshot.unavailable.some((entry) => entry.key === "fallback.status")).toBe(true);
    // Nothing is invented: every unavailable entry explains why.
    for (const entry of snapshot.unavailable) expect(entry.reason.length).toBeGreaterThan(10);
  });

  it("records maintenance mode transparently in settings", async () => {
    await resetDb();
    const admin = await makeAdmin();
    expect((await getMaintenanceState()).enabled).toBe(false);
    await setMaintenanceState(admin, { enabled: true, message: "Database migration in progress." });
    const state = await getMaintenanceState();
    expect(state.enabled).toBe(true);
    expect(state.message).toBe("Database migration in progress.");
    const overview = await adminOverview(admin);
    expect(overview.recentAudit.some((event) => event.action === "admin.maintenance_changed")).toBe(true);
  });
});
