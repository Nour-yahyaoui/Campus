import { searchQuery } from "@campussphere/contracts";
import { handleApi, enforceRateLimit, parseQuery, searchAll, jsonResponse } from "@campussphere/core";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, "/api/search", async () => {
    const url = new URL(request.url);
    const input = parseQuery(url, searchQuery);
    await enforceRateLimit(request, "api.search", 60, 60);
    const results = await searchAll(input.q, input.type ?? "all");
    return jsonResponse(results, 200, { "cache-control": "private, max-age=30" });
  });
}
