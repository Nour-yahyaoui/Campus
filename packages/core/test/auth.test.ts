import { describe, expect, it } from "vitest";
import { resetDb, freshEmail } from "./helpers";
import {
  createSession,
  devSignIn,
  resolveSession,
  revokeSession,
  rotateSession,
  consumeSignInTicket,
  issueSignInTicket,
  findMeById,
  googleRedirectUri,
} from "../src/auth";
import { query } from "../src/db";
import { getEnv, resetEnvCache } from "../src/env";

describe("sessions and identity", () => {
  it("creates a working session and resolves the signed-in user", async () => {
    await resetDb();
    const email = freshEmail();
    const session = await devSignIn({ email });
    expect(session.user.email).toBe(email);
    expect(session.token.length).toBeGreaterThan(20);

    const resolved = await resolveSession(session.token);
    expect(resolved?.id).toBe(session.user.id);

    // Only a hash is persisted; a database dump cannot be replayed.
    const stored = await query<{ token_hash: string }>("select token_hash from sessions");
    expect(stored.rows[0]!.token_hash).not.toBe(session.token);
  });

  it("rejects revoked and unknown tokens", async () => {
    await resetDb();
    const session = await devSignIn({ email: freshEmail() });
    await revokeSession(session.token);
    expect(await resolveSession(session.token)).toBeNull();
    expect(await resolveSession("x".repeat(40))).toBeNull();
  });

  it("rotates a session and invalidates the old token", async () => {
    await resetDb();
    const user = await findMeById(
      (await devSignIn({ email: freshEmail(), name: "Rotator" })).user.id,
    );
    const original = await createSession(user!.id);
    const rotated = await rotateSession(original.token);
    expect(await resolveSession(original.token)).toBeNull();
    expect((await resolveSession(rotated.token))?.id).toBe(user!.id);
  });

  it("accepts a single-use sign-in ticket exactly once", async () => {
    await resetDb();
    const session = await devSignIn({ email: freshEmail() });
    const ticket = await issueSignInTicket(session.user.id);
    const exchanged = await consumeSignInTicket(ticket.ticket);
    expect(exchanged.user.id).toBe(session.user.id);
    await expect(consumeSignInTicket(ticket.ticket)).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("refuses suspended accounts at session resolution", async () => {
    await resetDb();
    const session = await devSignIn({ email: freshEmail() });
    await query("update users set status = 'suspended' where id = $1", [session.user.id]);
    expect(await resolveSession(session.token)).toBeNull();
  });

  it("cannot enable development sign-in in production", () => {
    resetEnvCache();
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    process.env.ALLOW_DEV_SIGN_IN = "true";
    try {
      expect(() => getEnv()).toThrow(/ALLOW_DEV_SIGN_IN/);
    } finally {
      process.env.NODE_ENV = previous;
      resetEnvCache();
    }
  });
});

describe("Google redirect URI", () => {
  const canonical = "http://localhost:3000/api/auth/google/callback";

  it("defaults to the canonical host", () => {
    expect(googleRedirectUri()).toBe(canonical);
    expect(googleRedirectUri(null)).toBe(canonical);
  });

  it("follows a Vercel alias, because OAuth matches the URI verbatim", () => {
    // Otherwise a deployment works on exactly one hostname and every alias
    // answers `redirect_uri_mismatch` — the failure this exists to prevent.
    expect(googleRedirectUri("https://campus-spheree.vercel.app")).toBe(
      "https://campus-spheree.vercel.app/api/auth/google/callback",
    );
  });

  it("honours an explicitly listed origin", () => {
    process.env.AUTH_ALLOWED_ORIGINS = "https://campus.example.edu, https://staging.example.edu/";
    try {
      expect(googleRedirectUri("https://campus.example.edu")).toBe(
        "https://campus.example.edu/api/auth/google/callback",
      );
      expect(googleRedirectUri("https://staging.example.edu")).toBe(
        "https://staging.example.edu/api/auth/google/callback",
      );
    } finally {
      delete process.env.AUTH_ALLOWED_ORIGINS;
    }
  });

  it("ignores hostnames nobody allowed", () => {
    process.env.AUTH_ALLOWED_ORIGINS = "";
    try {
      expect(googleRedirectUri("https://evil.example")).toBe(canonical);
      expect(googleRedirectUri("javascript:alert(1)")).toBe(canonical);
      expect(googleRedirectUri("not a url")).toBe(canonical);
    } finally {
      delete process.env.AUTH_ALLOWED_ORIGINS;
    }
  });
});
