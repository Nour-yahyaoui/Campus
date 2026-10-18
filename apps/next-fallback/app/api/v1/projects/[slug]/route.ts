import { getProjectBySlug, jsonResponse, notFound } from "@campussphere/core";
import { withRead } from "@/lib/api";

export const dynamic = "force-dynamic";

export function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return withRead(request, "/api/v1/projects/{slug}", async () => {
    const { slug } = await params;
    if (!slug || slug.length > 160) throw notFound("Project not found");
    const project = await getProjectBySlug(slug, null);
    return jsonResponse({ data: project }, 200, {
      "cache-control": "public, max-age=30, stale-while-revalidate=60",
    });
  });
}
