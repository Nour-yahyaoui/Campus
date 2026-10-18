import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/api/v1/*` is the one place where the Rust service actually serves traffic.
 * These tests pin the three things that could quietly go wrong: proxying when a
 * primary is configured, answering locally when it is not, and never claiming
 * the primary answered when it did not.
 */

const config: { API_BASE_URL?: string; NEXT_PUBLIC_SITE_URL: string } = {
  NEXT_PUBLIC_SITE_URL: "https://campus-spheree.vercel.app",
};

function failing(status: number) {
  return (message: string) => Object.assign(new Error(message), { status });
}

vi.mock("@campussphere/core", () => ({
  getEnv: () => config,
  handleApi: async (
    _request: Request,
    _route: string,
    handler: (context: { correlationId: string }) => Promise<Response>,
  ) => {
    try {
      return await handler({ correlationId: "test-correlation" });
    } catch (error) {
      const status = (error as { status?: number }).status ?? 500;
      return new Response(JSON.stringify({ error: { message: (error as Error).message } }), {
        status,
        headers: { "content-type": "application/json" },
      });
    }
  },
  jsonResponse: (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    }),
  parseQuery: (url: URL) => Object.fromEntries(url.searchParams.entries()),
  enforceRateLimit: async () => undefined,
  listClubs: async () => ({ items: [{ slug: "coffee-collective", memberCount: 68 }], nextCursor: null }),
  listProjects: async () => ({ items: [], nextCursor: null }),
  listEvents: async () => ({ items: [], nextCursor: null }),
  getClubBySlug: async (slug: string) => ({ slug }),
  getProjectBySlug: async (slug: string) => ({ slug }),
  getEventBySlug: async (slug: string) => ({ slug }),
  searchAll: async () => ({ clubs: [], projects: [], events: [] }),
  notFound: failing(404),
  unavailable: failing(503),
}));

const route = await import("../app/api/v1/[...rest]/route");

function call(
  method: "GET" | "POST",
  path: string[],
  query = "",
): Promise<Response> {
  const request = new Request(`https://campus-spheree.vercel.app/api/v1/${path.join("/")}${query}`, {
    method,
  });
  const context = { params: Promise.resolve({ rest: path }) };
  const handler = method === "GET" ? route.GET : route.POST;
  return handler(request, context) as Promise<Response>;
}

describe("the public read API", () => {
  beforeEach(() => {
    config.API_BASE_URL = undefined;
    vi.unstubAllGlobals();
  });

  it("answers from this deployment when no primary is configured", async () => {
    const response = await call("GET", ["clubs"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-campussphere-served-by")).toBe("nextjs-fallback");
    expect(response.headers.get("x-campussphere-primary")).toBe("not-configured");
    expect(response.headers.get("warning")).toBeNull();
    const body = (await response.json()) as { data: Array<{ slug: string }> };
    expect(body.data[0]?.slug).toBe("coffee-collective");
  });

  it("proxies to the primary and says the primary answered", async () => {
    config.API_BASE_URL = "https://campusshere.onrender.com";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ slug: "from-rust" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await call("GET", ["clubs"], "?category=technology&limit=5");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-campussphere-served-by")).toBe("actix-primary");
    const body = (await response.json()) as { data: Array<{ slug: string }> };
    expect(body.data[0]?.slug).toBe("from-rust");

    const target = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(target).toBe(
      "https://campusshere.onrender.com/api/v1/clubs?category=technology&limit=5",
    );
  });

  it("answers locally, and says why, when the primary does not answer", async () => {
    config.API_BASE_URL = "https://campusshere.onrender.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const response = await call("GET", ["clubs"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-campussphere-served-by")).toBe("nextjs-fallback");
    expect(response.headers.get("x-campussphere-primary")).toBe("unreachable");
    expect(response.headers.get("warning")).toContain("Actix primary did not answer");
  });

  it("falls back when the primary is up but broken", async () => {
    config.API_BASE_URL = "https://campusshere.onrender.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream exploded", { status: 502 })),
    );

    const response = await call("GET", ["events"]);
    expect(response.headers.get("x-campussphere-served-by")).toBe("nextjs-fallback");
    expect(response.headers.get("x-campussphere-primary")).toBe("unreachable");
  });

  it("passes a client error through instead of pretending it is an outage", async () => {
    config.API_BASE_URL = "https://campusshere.onrender.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { code: "not_found" } }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const response = await call("GET", ["clubs", "does-not-exist"]);
    expect(response.status).toBe(404);
    expect(response.headers.get("x-campussphere-served-by")).toBe("actix-primary");
  });

  it("refuses writes instead of half-implementing them", async () => {
    const response = await call("POST", ["clubs"]);
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: { message: string } }).error.message).toContain(
      "read-only",
    );
  });
});
