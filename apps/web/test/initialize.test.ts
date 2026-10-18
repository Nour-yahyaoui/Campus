import { describe, expect, it } from "vitest";
import { decideAccess, escapeHtml, tokenMatches, type DatabaseState } from "../lib/initialize";

const empty: DatabaseState = { schemaReady: false, users: 0, superAdmins: 0 };
const initialized: DatabaseState = { schemaReady: true, users: 30, superAdmins: 1 };

describe("setup access control", () => {
  it("compares tokens exactly and without early exit", () => {
    expect(tokenMatches("correct-horse-battery", "correct-horse-battery")).toBe(true);
    expect(tokenMatches("correct-horse-battery", "correct-horse-batterY")).toBe(false);
    expect(tokenMatches("correct-horse-battery", "")).toBe(false);
    expect(tokenMatches("correct-horse-battery", null)).toBe(false);
    // An unset expected token must never match, even against an empty string.
    expect(tokenMatches("", "")).toBe(false);
  });

  it("allows first-run changes only while no super-admin exists", () => {
    expect(
      decideAccess({ tokenConfigured: false, expectedToken: "", providedToken: null, state: empty }),
    ).toEqual({ mode: "write", reason: "first-run" });
  });

  it("becomes read-only, not writable, once an admin exists and no token is configured", () => {
    expect(
      decideAccess({ tokenConfigured: false, expectedToken: "", providedToken: null, state: initialized }),
    ).toEqual({ mode: "read-only", reason: "already-initialized" });
  });

  it("refuses a wrong or missing token when SETUP_TOKEN is configured", () => {
    for (const provided of [null, "", "wrong"]) {
      const decision = decideAccess({
        tokenConfigured: true,
        expectedToken: "s3cret-setup-token",
        providedToken: provided,
        state: initialized,
      });
      expect(decision.mode).toBe("denied");
      if (decision.mode === "denied") expect(decision.status).toBe(401);
    }
  });

  it("allows a correct token to re-run setup on an initialised database", () => {
    expect(
      decideAccess({
        tokenConfigured: true,
        expectedToken: "s3cret-setup-token",
        providedToken: "s3cret-setup-token",
        state: initialized,
      }),
    ).toEqual({ mode: "write", reason: "token" });
  });

  it("treats the first-run window as closed as soon as any super-admin exists", () => {
    expect(
      decideAccess({
        tokenConfigured: false,
        expectedToken: "",
        providedToken: null,
        state: { schemaReady: true, users: 1, superAdmins: 1 },
      }).mode,
    ).toBe("read-only");
  });
});

describe("setup page escaping", () => {
  it("escapes every character that could break out of the HTML", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(escapeHtml("a & b 'c'")).toBe("a &amp; b &#39;c&#39;");
  });
});
