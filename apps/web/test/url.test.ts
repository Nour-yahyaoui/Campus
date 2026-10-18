import { afterEach, describe, expect, it, vi } from "vitest";
import { absoluteUrl } from "../lib/url";

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe("absoluteUrl", () => {
  it("uses the canonical site URL in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://campus.example.edu");
    expect(absoluteUrl("/login?next=/dashboard", request("http://0.0.0.0:3000/")).toString()).toBe(
      "https://campus.example.edu/login?next=/dashboard",
    );
  });

  it("uses the forwarded host in development so previews keep their origin", () => {
    vi.stubEnv("NODE_ENV", "development");
    const target = absoluteUrl(
      "/",
      request("http://0.0.0.0:3000/api/auth/logout", {
        "x-forwarded-host": "3000-abc.e2b.app",
        "x-forwarded-proto": "https",
      }),
    );
    expect(target.toString()).toBe("https://3000-abc.e2b.app/");
  });

  it("never sends a browser to the bound address", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    const target = absoluteUrl("/login", request("http://0.0.0.0:3000/api/auth/logout", { host: "0.0.0.0:3000" }));
    expect(target.toString()).not.toContain("0.0.0.0");
    expect(target.pathname).toBe("/login");
  });

  it("rejects protocol-relative and absolute paths", () => {
    vi.stubEnv("NODE_ENV", "development");
    const target = absoluteUrl("//evil.example/steal", request("http://localhost:3000/"));
    expect(target.origin).toBe("http://localhost:3000");
    expect(target.pathname).toBe("/");
  });
});
