import { eventListQuery } from "@campussphere/contracts";
import { jsonResponse, listEvents, parseQuery } from "@campussphere/core";
import { withRead } from "@/lib/api";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withRead(request, "/api/v1/events", async () => {
    const query = parseQuery(new URL(request.url), eventListQuery);
    const page = await listEvents({
      category: query.category,
      q: query.q,
      when: query.when,
      clubSlug: query.club,
      cursor: query.cursor,
      limit: query.limit,
    });
    return jsonResponse({ data: page.items, meta: { nextCursor: page.nextCursor } }, 200, {
      "cache-control": "public, max-age=30, stale-while-revalidate=60",
    });
  });
}
