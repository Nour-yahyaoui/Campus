import {
  clubListQuery,
  eventListQuery,
  projectListQuery,
  searchQuery,
} from "@campussphere/contracts";
import {
  enforceRateLimit,
  getClubBySlug,
  getEnv,
  getEventBySlug,
  getProjectBySlug,
  handleApi,
  jsonResponse,
  listClubs,
  listEvents,
  listProjects,
  notFound,
  parseQuery,
  searchAll,
  unavailable,
} from "@campussphere/core";

export const dynamic = "force-dynamic";

/**
 * The public read API, `/api/v1/*`.
 *
 * The Rust service is the primary here and this route is the only place in the
 * product that actually hands it traffic: with `API_BASE_URL` set, every read
 * is proxied to `${API_BASE_URL}/api/v1/...` and the response is streamed back
 * untouched. If the primary is slow, asleep or down, the same query is answered
 * from this deployment's own database instead — which is what makes it the
 * *fallback* API rather than a second copy that nobody calls.
 *
 * Which one answered is never a guess: every response carries
 * `x-campussphere-served-by`.
 */

const UPSTREAM_TIMEOUT_MS = 8_000;

type ServedBy = "actix-primary" | "nextjs-fallback";

function upstream(): URL | null {
  const env = getEnv();
  if (!env.API_BASE_URL) return null;
  try {
    const base = new URL(env.API_BASE_URL);
    // Pointing the primary at this deployment would be a proxy loop.
    if (base.origin === new URL(env.NEXT_PUBLIC_SITE_URL).origin) return null;
    return base;
  } catch {
    return null;
  }
}

function passThrough(response: Response, servedBy: ServedBy): Response {
  const headers = new Headers(response.headers);
  headers.set("x-campussphere-served-by", servedBy);
  // Hop-by-hop and encoding headers belong to the upstream connection, not to
  // the response we hand the client.
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.delete("connection");
  return new Response(response.body, { status: response.status, headers });
}

async function fromPrimary(request: Request, base: URL, path: string): Promise<Response | null> {
  const target = new URL(`/api/v1/${path}`, base);
  target.search = new URL(request.url).search;
  try {
    const response = await fetch(target, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
    // A 5xx is the primary saying it cannot answer; fall back. A 4xx is a
    // correct answer about the request and is passed through as-is.
    if (response.status >= 500) return null;
    return passThrough(response, "actix-primary");
  } catch {
    return null;
  }
}

/**
 * The same four collections, answered from this deployment. Deliberately only
 * the public reads: anything session-scoped or mutating is not part of this
 * contract and is refused by name instead of half-implemented.
 */
async function fromFallback(request: Request, path: string): Promise<Response> {
  const [head, slug, ...extra] = path.split("/").filter(Boolean);
  const cache = { "cache-control": "no-store" };
  const url = new URL(request.url);

  if (extra.length > 0) throw notFound("This endpoint is not part of the read contract.");
  if (head !== "clubs" && head !== "projects" && head !== "events" && head !== "search") {
    throw notFound("This endpoint is not part of the read contract.");
  }

  if (head === "clubs") {
    if (slug) {
      if (slug.length > 160) throw notFound("Club not found");
      return jsonResponse({ data: await getClubBySlug(slug, null) }, 200, cache);
    }
    const query = parseQuery(url, clubListQuery);
    const page = await listClubs({
      category: query.category,
      q: query.q,
      cursor: query.cursor,
      limit: query.limit,
    });
    return jsonResponse({ data: page.items, meta: { nextCursor: page.nextCursor } }, 200, cache);
  }

  if (head === "projects") {
    if (slug) {
      if (slug.length > 160) throw notFound("Project not found");
      return jsonResponse({ data: await getProjectBySlug(slug, null) }, 200, cache);
    }
    const query = parseQuery(url, projectListQuery);
    const page = await listProjects({
      category: query.category,
      q: query.q,
      clubSlug: query.club,
      cursor: query.cursor,
      limit: query.limit,
    });
    return jsonResponse({ data: page.items, meta: { nextCursor: page.nextCursor } }, 200, cache);
  }

  if (head === "events") {
    if (slug) {
      if (slug.length > 160) throw notFound("Event not found");
      return jsonResponse({ data: await getEventBySlug(slug, null) }, 200, cache);
    }
    const query = parseQuery(url, eventListQuery);
    const page = await listEvents({
      category: query.category,
      q: query.q,
      when: query.when,
      clubSlug: query.club,
      cursor: query.cursor,
      limit: query.limit,
    });
    return jsonResponse({ data: page.items, meta: { nextCursor: page.nextCursor } }, 200, cache);
  }

  const query = parseQuery(url, searchQuery);
  if (query.q.trim().length < 2) {
    return jsonResponse({ data: { clubs: [], projects: [], events: [] }, meta: { q: query.q } }, 200, cache);
  }
  const results = await searchAll(query.q.trim(), query.type ?? "all");
  return jsonResponse({ data: results, meta: { q: query.q, type: query.type ?? "all" } }, 200, cache);
}

async function serve(request: Request, rest: string[]): Promise<Response> {
  const path = rest.join("/");
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    throw unavailable(
      `The read API is read-only, so ${method} /api/v1/${path} was not performed. Mutations go through the app's own endpoints.`,
    );
  }

  const base = upstream();
  if (base) {
    const response = await fromPrimary(request, base, path);
    if (response) return response;
  }

  await enforceRateLimit(request, "api.v1", 120, 60);
  const response = await fromFallback(request, path);
  response.headers.set("x-campussphere-served-by", "nextjs-fallback");
  response.headers.set("x-campussphere-primary", base ? "unreachable" : "not-configured");
  if (base) response.headers.set("warning", '110 - "the Actix primary did not answer; served from the fallback"');
  return response;
}

type Context = { params: Promise<{ rest: string[] }> };

export async function GET(request: Request, context: Context) {
  const { rest } = await context.params;
  return handleApi(request, `/api/v1/${rest.join("/")}`, () => serve(request, rest));
}

export const HEAD = GET;

function readOnly(method: string) {
  return (request: Request, context: Context) =>
    context.params.then(({ rest }) =>
      handleApi(request, `/api/v1/${rest.join("/")}`, async () => {
        throw unavailable(
          `The read API is read-only, so ${method} /api/v1/${rest.join("/")} was not performed.`,
        );
      }),
    );
}

export const POST = readOnly("POST");
export const PUT = readOnly("PUT");
export const PATCH = readOnly("PATCH");
export const DELETE = readOnly("DELETE");
