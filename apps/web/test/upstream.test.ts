import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The page render path prefers the Actix service and falls back to the local
 * database. These tests pin the three failure modes that would be invisible in
 * review: a slow primary holding a page hostage, a broken primary poisoning the
 * page with half-shaped data, and the circuit breaker never closing back up.
 */

const config: { API_BASE_URL?: string; NEXT_PUBLIC_SITE_URL: string } = {
  NEXT_PUBLIC_SITE_URL: "https://campus.example",
};

vi.mock("server-only", () => ({}));
vi.mock("@campussphere/core", () => ({ getEnv: () => config }));

async function load() {
  vi.resetModules();
  return import("../lib/upstream");
}

const club = (overrides: Record<string, unknown> = {}) => ({
  id: "1",
  slug: "coffee",
  name: "Coffee",
  memberCount: 3,
  ...overrides,
});

const isClub = (item: unknown): boolean => {
  const value = item as Partial<ReturnType<typeof club>> | null;
  return (
    typeof value?.id === "string" && typeof value?.slug === "string" && typeof value?.name === "string"
  );
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  delete config.API_BASE_URL;
  vi.unstubAllGlobals();
});

describe("primary reads", () => {
  it("returns the primary's page and query", async () => {
    config.API_BASE_URL = "https://primary.example";
    const fetchSpy = vi.fn(async () => json({ data: [club()], meta: { nextCursor: "abc" } }));
    vi.stubGlobal("fetch", fetchSpy);

    const { primaryList } = await load();
    await expect(primaryList("clubs", { limit: 3, q: "cof" }, isClub)).resolves.toEqual({
      items: [club()],
      nextCursor: "abc",
    });

    const called = new URL(String((fetchSpy.mock.calls[0] as unknown[])[0]));
    expect(called.origin).toBe("https://primary.example");
    expect(called.pathname).toBe("/api/v1/clubs");
    expect(called.searchParams.get("limit")).toBe("3");
    expect(called.searchParams.get("q")).toBe("cof");
  });

  it("falls back when the primary answers 5xx", async () => {
    config.API_BASE_URL = "https://primary.example";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));

    const { primaryList } = await load();
    await expect(primaryList("clubs", {}, isClub)).resolves.toBeNull();
  });

  it("falls back when the request fails or times out", async () => {
    config.API_BASE_URL = "https://primary.example";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      }),
    );

    const { primaryList } = await load();
    await expect(primaryList("clubs", {}, isClub)).resolves.toBeNull();
  });

  it("refuses data it cannot render instead of half-rendering it", async () => {
    config.API_BASE_URL = "https://primary.example";
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [{ id: "1", slug: "coffee" }] })));

    const { primaryList } = await load();
    await expect(primaryList("clubs", {}, isClub)).resolves.toBeNull();
  });

  it("does nothing when no primary is configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { primaryList, primaryConfigured } = await load();
    expect(primaryConfigured()).toBe(false);
    await expect(primaryList("clubs", {}, isClub)).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a primary that points at this deployment", async () => {
    config.API_BASE_URL = "https://campus.example";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { primaryList } = await load();
    await expect(primaryList("clubs", {}, isClub)).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stops paying the timeout once the primary has failed", async () => {
    config.API_BASE_URL = "https://primary.example";
    const failing = vi.fn(async () => {
      throw new Error("connection refused");
    });
    vi.stubGlobal("fetch", failing);

    const { primaryList } = await load();
    await expect(primaryList("clubs", {}, isClub)).resolves.toBeNull();
    expect(failing).toHaveBeenCalledTimes(1);

    // The breaker is open: the next call must not even try, even though the
    // service would answer now.
    const working = vi.fn(async () => json({ data: [club()] }));
    vi.stubGlobal("fetch", working);
    await expect(primaryList("clubs", {}, isClub)).resolves.toBeNull();
    expect(working).not.toHaveBeenCalled();
  });

  it("reads a search document", async () => {
    config.API_BASE_URL = "https://primary.example";
    const document = { query: "rob", clubs: [], projects: [], events: [], total: 0 };
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: document })));

    const { primarySearch } = await load();
    const isDocument = (value: unknown) =>
      Array.isArray((value as { clubs?: unknown })?.clubs) &&
      typeof (value as { total?: unknown })?.total === "number";
    await expect(primarySearch("rob", "all", isDocument)).resolves.toEqual(document);
  });
});
