import { describe, expect, it } from "vitest";
import { applyPendingMigrations, listMigrationFiles, migrationStatus, migrationsDirectory } from "../src/migrations";
import { query } from "../src/db";

/**
 * The route `/api/initialize` calls exactly these functions, so this suite is
 * the contract that a fresh deployment can be prepared without a terminal.
 */
describe("schema application", () => {
  it("finds the migrations directory and every .sql file", async () => {
    const directory = await migrationsDirectory();
    expect(directory.endsWith("migrations")).toBe(true);
    const files = await listMigrationFiles();
    expect(files.length).toBeGreaterThanOrEqual(7);
    expect(files.map((file) => file.name)).toEqual([...files.map((file) => file.name)].sort());
    expect(files[0]!.name).toMatch(/^\d{4}_/);
    expect(files.every((file) => file.checksum.length === 64)).toBe(true);
  });

  it("reports a fully migrated database as up to date", async () => {
    const status = await migrationStatus();
    expect(status.changed).toEqual([]);
    expect(status.pending).toEqual([]);
    expect(status.applied.length).toBe(status.total);
  });

  it("is idempotent: a second run applies nothing", async () => {
    const result = await applyPendingMigrations();
    expect(result.applied).toEqual([]);
    expect(result.alreadyApplied).toBe(result.total);
    expect(result.total).toBeGreaterThanOrEqual(7);
  });

  it("keeps the same ledger format as the CLI so either path recognises the other", async () => {
    const rows = await query<{ name: string; checksum: string; duration_ms: number }>(
      "select name, checksum, duration_ms from schema_migrations order by name",
    );
    expect(rows.rows.length).toBeGreaterThanOrEqual(7);
    for (const row of rows.rows) {
      expect(row.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(row.duration_ms).toBeGreaterThanOrEqual(0);
    }
  });
});
