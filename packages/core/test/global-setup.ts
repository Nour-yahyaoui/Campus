import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Integration tests run against a real PostgreSQL database (DATABASE_URL).
 * The suite refuses to run against a database whose name does not end in
 * `_test`, so a typo can never truncate development data.
 */
export default function setup() {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/campussphere_test";
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL must point at a local *_test database. See docs/DEVELOPMENT.md.");
  }
  const database = new URL(url).pathname.replace(/^\//, "");
  if (!database.endsWith("_test")) {
    throw new Error(`Refusing to run destructive tests against "${database}"; the name must end in _test.`);
  }
  const root = path.resolve(__dirname, "../../..");
  execFileSync("node", [path.join(root, "scripts/db.mjs"), "migrate"], {
    stdio: "inherit",
    env: process.env,
  });
}
