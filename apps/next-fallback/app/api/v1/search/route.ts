import { searchQuery } from "@campussphere/contracts";
import { jsonResponse, parseQuery, searchAll } from "@campussphere/core";
import { withRead } from "@/lib/api";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withRead(request, "/api/v1/search", async () => {
    const query = parseQuery(new URL(request.url), searchQuery);
    if (query.q.trim().length < 2) {
      return jsonResponse({ data: { clubs: [], projects: [], events: [] }, meta: { q: query.q } });
    }
    const results = await searchAll(query.q.trim(), query.type ?? "all");
    return jsonResponse({ data: results, meta: { q: query.q, type: query.type ?? "all" } });
  });
}
