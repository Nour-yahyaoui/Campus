import { execFileSync } from "node:child_process";
import path from "node:path";

export default function setup() {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/campussphere_test";
  const database = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "");
  if (!database.endsWith("_test")) {
    throw new Error(`Refusing to run destructive tests against "${database}"`);
  }
  const root = path.resolve(__dirname, "../../..");
  execFileSync("node", [path.join(root, "scripts/db.mjs"), "migrate"], {
    stdio: "inherit",
    env: process.env,
  });
}
