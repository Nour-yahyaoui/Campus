#!/usr/bin/env node
/**
 * One-time super-admin bootstrap.
 *
 *   npm run admin:bootstrap   (or)
 *   CONFIRM_SUPERADMIN=you@university.edu npx tsx scripts/bootstrap-superadmin.mjs
 *
 * Creates the account if it does not exist yet (it links to Google on first
 * sign-in with the same verified email) and grants the super_admin role.
 * Refuses to run without the explicit confirmation variable, so it cannot be
 * triggered accidentally by a deployment script. Safe to re-run: the role is
 * de-duplicated and every run is audited.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const email = (process.env.CONFIRM_SUPERADMIN ?? "").trim().toLowerCase();

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(
    "Refusing to run.\n" +
      "Set CONFIRM_SUPERADMIN to the email address that should become the first super-admin:\n" +
      "  CONFIRM_SUPERADMIN=you@university.edu npm run admin:bootstrap",
  );
  process.exit(2);
}

const { bootstrapSuperAdmin, closePool } = await import(path.join(root, "packages/core/src/index.ts"));
const { created } = await bootstrapSuperAdmin(email);

console.log(
  created
    ? `Created ${email} as super_admin. Sign in with Google using this email to link the account.`
    : `Granted super_admin to existing account ${email}.`,
);
console.log("Audit record written. Done.");
await closePool();
