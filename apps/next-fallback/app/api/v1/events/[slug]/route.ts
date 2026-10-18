import { getEventBySlug, jsonResponse, notFound } from "@campussphere/core";
import { withRead } from "@/lib/api";

export const dynamic = "force-dynamic";

export function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return withRead(request, "/api/v1/events/{slug}", async () => {
    const { slug } = await params;
    if (!slug || slug.length > 160) throw notFound("Event not found");
    const event = await getEventBySlug(slug, null);
    return jsonResponse({ data: event }, 200, {
      "cache-control": "public, max-age=30, stale-while-revalidate=60",
    });
  });
}
