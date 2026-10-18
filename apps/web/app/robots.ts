import type { MetadataRoute } from "next";
import { siteUrl } from "@campussphere/core";

/**
 * robots.txt.
 *
 * The default rule allows the public catalogue and closes the authenticated
 * surfaces. AI crawlers are named explicitly and allowed — a university
 * platform wants to be citable by assistants — while `CCBot` (which resells
 * crawled text for model training without attribution) is the one common bot
 * held to the public pages only, same as everything else.
 */
// Rendered per request: `siteUrl()` is only known at runtime, and a robots.txt
// pointing at the wrong host sends crawlers to a sitemap that is not there.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  const closed = [
    "/dashboard",
    "/dashboard/",
    "/admin",
    "/admin/",
    "/observatory",
    "/observatory/",
    "/login",
    "/api/",
    "/media/",
    // Search result pages are generated from user input; indexing every query
    // string would create duplicates of the real listings.
    "/search",
    "/search?",
  ];

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: closed },
      // Retrieval bots fetch a page to answer one question. Allowing them is
      // what makes the site appear in assistant answers, with a link back.
      { userAgent: ["GPTBot", "OAI-SearchBot", "ChatGPT-User"], allow: "/", disallow: closed },
      { userAgent: ["ClaudeBot", "Claude-Web", "anthropic-ai"], allow: "/", disallow: closed },
      { userAgent: ["PerplexityBot", "Perplexity-User"], allow: "/", disallow: closed },
      { userAgent: "Google-Extended", allow: "/", disallow: closed },
      { userAgent: ["Bingbot", "DuckDuckBot", "Applebot", "YandexBot"], allow: "/", disallow: closed },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
