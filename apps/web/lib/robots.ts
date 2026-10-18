/**
 * robots.txt, as text.
 *
 * The public catalogue is open. Authenticated surfaces are closed, not because
 * they are secret — they redirect to sign-in — but because crawling them creates
 * endless redirect chains in a search console. `/search` is closed because its
 * result pages are generated from user input, so indexing them would create one
 * near-duplicate page per query string.
 *
 * AI crawlers are named explicitly and allowed: a university platform wants to
 * be citable by assistants, with a link back. `Google-Extended` controls Gemini
 * training separately from `Googlebot` indexing, and is allowed here for the
 * same reason.
 *
 * `Host:` is a Yandex directive; `Sitemap:` is the one every crawler reads. Both
 * must carry the real origin, which is why this is rendered per request.
 */

const CLOSED = [
  "/dashboard",
  "/dashboard/",
  "/admin",
  "/admin/",
  "/observatory",
  "/observatory/",
  "/login",
  "/api/",
  "/media/",
  "/search",
  "/search?",
];

const GROUPS: string[][] = [
  ["*"],
  ["GPTBot", "OAI-SearchBot", "ChatGPT-User"],
  ["ClaudeBot", "Claude-Web", "anthropic-ai"],
  ["PerplexityBot", "Perplexity-User"],
  ["Google-Extended"],
  ["Bingbot", "DuckDuckBot", "Applebot", "YandexBot"],
];

export function robotsText(base: string): string {
  const origin = base.replace(/\/+$/, "");
  const groups = GROUPS.map((agents) =>
    [
      ...agents.map((agent) => `User-agent: ${agent}`),
      "Allow: /",
      ...CLOSED.map((path) => `Disallow: ${path}`),
    ].join("\n"),
  );
  return `${groups.join("\n\n")}\n\nHost: ${origin}\nSitemap: ${origin}/sitemap.xml\n`;
}
