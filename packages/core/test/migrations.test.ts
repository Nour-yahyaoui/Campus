import { describe, expect, it } from "vitest";
import os from "node:os";
import { applyPendingMigrations, listMigrationFiles, migrationFiles, migrationStatus, migrationsDirectory } from "../src/migrations";
import { EMBEDDED_MIGRATIONS } from "../src/migrations.generated";
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

  it("ships the compiled-in copy in sync with migrations/", async () => {
    // A serverless bundle has no migrations/ folder, so the SQL is compiled in.
    // If these two ever diverge, /api/initialize would create a different schema
    // depending on where it runs — and its checksums would fight the CLI.
    const fromDisk = await listMigrationFiles();
    expect(EMBEDDED_MIGRATIONS.map((m) => m.name)).toEqual(fromDisk.map((f) => f.name));
    for (const [index, embedded] of EMBEDDED_MIGRATIONS.entries()) {
      expect(embedded.checksum).toBe(fromDisk[index]!.checksum);
      expect(embedded.sql).toBe(fromDisk[index]!.sql);
    }
  });

  it("uses the .sql files when they are on disk", async () => {
    const source = await migrationFiles();
    expect(source.embedded).toBe(false);
    expect(source.directory).not.toBeNull();
  });

  it("falls back to the embedded copy when the directory is absent", async () => {
    // A serverless bundle has no migrations/ folder at all. Standing in a
    // directory without one is the closest honest reproduction.
    const original = process.cwd();
    process.chdir(os.tmpdir());
    try {
      const source = await migrationFiles();
      expect(source.embedded).toBe(true);
      expect(source.directory).toBeNull();
      expect(source.files.map((file) => file.name)).toEqual(EMBEDDED_MIGRATIONS.map((m) => m.name));
    } finally {
      process.chdir(original);
    }
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
