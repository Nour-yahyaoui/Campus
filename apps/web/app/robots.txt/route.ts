import { siteUrl } from "@campussphere/core";
import { robotsText } from "@/lib/robots";

/**
 * A route handler rather than `app/robots.ts`, for the same reason as the
 * sitemap: the origin is a runtime fact, and the shared cache needs an explicit
 * lifetime. A stale robots.txt is not harmless — it points crawlers at the wrong
 * host, and edge caches kept the build-time copy long enough to matter.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(robotsText(siteUrl()), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=600, stale-while-revalidate=86400",
    },
  });
}
