import { jsonResponse, notFound, getClubBySlug } from "@campussphere/core";
import { withRead } from "@/lib/api";

export const dynamic = "force-dynamic";

export function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return withRead(request, "/api/v1/clubs/{slug}", async () => {
    const { slug } = await params;
    if (!slug || slug.length > 160) throw notFound("Club not found");
    const club = await getClubBySlug(slug, null);
    return jsonResponse({ data: club }, 200, {
      "cache-control": "public, max-age=30, stale-while-revalidate=60",
    });
  });
}
