import { describe, expect, it } from "vitest";
import { buildCsp, originOf, storageOrigins } from "../lib/csp";

/**
 * Uploads travel browser -> object storage with a presigned PUT. A policy of
 * `connect-src 'self'` blocks that request, so the bucket origin has to be
 * allowed explicitly — and only the bucket origin, never a wildcard.
 */
describe("content security policy", () => {
  it("reduces endpoints to their origin", () => {
    expect(originOf("https://br-hidden.storage.c-3.eu-central-1.aws.neon.tech/campus/club_logo/a.png")).toBe(
      "https://br-hidden.storage.c-3.eu-central-1.aws.neon.tech",
    );
    expect(originOf("http://localhost:9000")).toBe("http://localhost:9000");
    expect(originOf(undefined)).toBeNull();
    expect(originOf("")).toBeNull();
    expect(originOf("not a url")).toBeNull();
  });

  it("refuses non-http schemes", () => {
    expect(originOf("javascript:alert(1)")).toBeNull();
    expect(originOf("data:text/html,x")).toBeNull();
  });

  it("collects the storage origin once, from whichever variable is set", () => {
    const origins = storageOrigins({
      AWS_ENDPOINT_URL_S3: "https://br-hidden.storage.c-3.eu-central-1.aws.neon.tech",
      S3_ENDPOINT: "https://br-hidden.storage.c-3.eu-central-1.aws.neon.tech/",
      STORAGE_PUBLIC_BASE_URL: "https://br-hidden.storage.c-3.eu-central-1.aws.neon.tech/campus",
    });
    expect(origins).toEqual(["https://br-hidden.storage.c-3.eu-central-1.aws.neon.tech"]);
  });

  it("allows the storage origin to be connected to", () => {
    const csp = buildCsp({ nonce: "abc", isDev: false, connectOrigins: ["https://bucket.example"] });
    expect(csp).toContain("connect-src 'self' https://bucket.example");
    expect(csp).not.toMatch(/connect-src[^;]*\*/);
  });

  it("keeps the nonce, and tightens in production", () => {
    const dev = buildCsp({ nonce: "n0nce", isDev: true });
    expect(dev).toContain("'nonce-n0nce'");
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).not.toContain("upgrade-insecure-requests");

    const prod = buildCsp({ nonce: "n0nce", isDev: false });
    expect(prod).toContain("upgrade-insecure-requests");
    expect(prod).not.toContain("'unsafe-eval'");
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
  });
});
