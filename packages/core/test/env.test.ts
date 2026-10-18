import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnv } from "../src/env";

/**
 * Hosting dashboards save a cleared field as an empty string, not as an absent
 * variable. Every optional value here has to survive that, because the cost of
 * getting it wrong is a canonical URL with no host — worse for search engines
 * than a canonical that points at the fallback origin.
 */

const base: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgresql://postgres@127.0.0.1:55432/campussphere",
  NODE_ENV: "development",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loadEnv origin resolution", () => {
  it("ignores an empty NEXT_PUBLIC_SITE_URL and uses the host's production URL", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "campus-web.example.vercel.app");
    const env = loadEnv({ ...base, NEXT_PUBLIC_SITE_URL: "" });
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://campus-web.example.vercel.app");
  });

  it("falls back to localhost when neither the variable nor the host provides one", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    const env = loadEnv({ ...base, NEXT_PUBLIC_SITE_URL: "   " });
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
  });

  it("keeps an explicit origin exactly as configured", () => {
    const env = loadEnv({ ...base, NEXT_PUBLIC_SITE_URL: "https://campus.example.edu" });
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://campus.example.edu");
  });

  it("rejects a value that is not a URL instead of shipping it", () => {
    expect(() => loadEnv({ ...base, NEXT_PUBLIC_SITE_URL: "campus.example.edu" })).toThrow(
      /NEXT_PUBLIC_SITE_URL/,
    );
  });
});

describe("loadEnv optional strings", () => {
  it("treats blank Google credentials as not configured", () => {
    const env = loadEnv({ ...base, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "  " });
    expect(env.googleConfigured).toBe(false);
  });

  it("treats a blank setup token as unset rather than as a secret of no length", () => {
    const env = loadEnv({ ...base, SETUP_TOKEN: "" });
    expect(env.SETUP_TOKEN).toBeUndefined();
  });

  it("still refuses a real setup token that is too short", () => {
    expect(() => loadEnv({ ...base, SETUP_TOKEN: "short" })).toThrow(/SETUP_TOKEN/);
  });
});

describe("loadEnv environment label", () => {
  it("never calls a production process development", () => {
    const env = loadEnv({ ...base, NODE_ENV: "production" });
    expect(env.APP_ENV).toBe("production");
  });

  it("keeps an explicitly configured APP_ENV", () => {
    expect(loadEnv({ ...base, APP_ENV: "staging" }).APP_ENV).toBe("staging");
  });
});
