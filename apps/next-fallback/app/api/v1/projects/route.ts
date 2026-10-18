import { projectListQuery } from "@campussphere/contracts";
import { jsonResponse, listProjects, parseQuery } from "@campussphere/core";
import { withRead } from "@/lib/api";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withRead(request, "/api/v1/projects", async () => {
    const query = parseQuery(new URL(request.url), projectListQuery);
    const page = await listProjects({
      category: query.category,
      q: query.q,
      clubSlug: query.club,
      cursor: query.cursor,
      limit: query.limit,
    });
    return jsonResponse({ data: page.items, meta: { nextCursor: page.nextCursor } }, 200, {
      "cache-control": "public, max-age=30, stale-while-revalidate=60",
    });
  });
}
