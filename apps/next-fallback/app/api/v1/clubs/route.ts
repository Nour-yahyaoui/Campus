import { clubListQuery } from "@campussphere/contracts";
import { jsonResponse, listClubs, parseQuery } from "@campussphere/core";
import { withRead } from "@/lib/api";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withRead(request, "/api/v1/clubs", async () => {
    const url = new URL(request.url);
    const query = parseQuery(url, clubListQuery);
    const page = await listClubs({
      category: query.category,
      q: query.q,
      cursor: query.cursor,
      limit: query.limit,
    });
    return jsonResponse({ data: page.items, meta: { nextCursor: page.nextCursor } }, 200, {
      "cache-control": "public, max-age=30, stale-while-revalidate=60",
    });
  });
}

export function POST(request: Request) {
  return withRead(request, "/api/v1/clubs", async (context) => {
    const { readOnlyResponse } = await import("@/lib/api");
    return readOnlyResponse("/api/v1/clubs", context.correlationId);
  });
}
