#!/usr/bin/env node
/**
 * Makes `npm install` inside apps/web produce a buildable monorepo.
 *
 * Vercel's default install runs in the project's Root Directory (`apps/web`).
 * npm then installs only that workspace's own dependencies, so the shared
 * packages the app imports stay incomplete: `packages/core` needs `pg`, `jose`
 * and the AWS SDK, and `apps/web` does not declare them. The build fails with
 * "Module not found" for each of them.
 *
 * The deployment settings are deliberately left alone — no custom install
 * command, no root directory change — so this script does the one thing that is
 * missing: install the workspace from the repository root, which links
 * `@campussphere/*` and installs every package's dependencies where Node and
 * Turbopack resolve them.
 *
 * It is idempotent and skips itself when
 *   • the deployment is not a monorepo checkout (no lockfile above us),
 *   • the root dependencies are already present, or
 *   • it is being called from the install it started.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const lockfile = path.join(root, "package-lock.json");
const marker = path.join(root, "node_modules", "pg", "package.json");

const skip = (reason) => {
  console.log(`[workspace] ${reason}; nothing to do.`);
  process.exit(0);
};

if (process.env.CAMPUSSPHERE_WORKSPACE_INSTALL === "1") skip("inside the workspace install");
if (!existsSync(lockfile)) skip("no package-lock.json above apps/web (standalone checkout)");
if (existsSync(marker)) skip("workspace dependencies already installed");

console.log(`[workspace] installing the monorepo from ${root}`);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
// `npm install` rather than `npm ci`: incremental, and it does not delete a
// node_modules tree the host may have cached. --ignore-scripts keeps this from
// re-entering the postinstall hooks of the other workspaces.
const result = spawnSync(
  npm,
  ["install", "--include=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, CAMPUSSPHERE_WORKSPACE_INSTALL: "1" },
  },
);

if (result.error) {
  console.error(`[workspace] could not run npm: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`[workspace] npm exited with ${result.status}`);
  process.exit(result.status ?? 1);
}
if (!existsSync(marker)) {
  console.error("[workspace] install finished but packages/core dependencies are still missing");
  process.exit(1);
}
console.log("[workspace] done");
