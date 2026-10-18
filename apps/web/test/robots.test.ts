import { describe, expect, it } from "vitest";
import { robotsText } from "../lib/robots";

const text = robotsText("https://campus.example.edu/");

describe("robotsText", () => {
  it("points the sitemap and host at the canonical origin, without a double slash", () => {
    expect(text).toContain("Sitemap: https://campus.example.edu/sitemap.xml");
    expect(text).toContain("Host: https://campus.example.edu");
    expect(text).not.toContain("//sitemap.xml");
  });

  it("closes the authenticated and generated surfaces for every crawler", () => {
    const disallowLines = text.split("\n").filter((line) => line.startsWith("Disallow:"));
    expect(disallowLines).toContain("Disallow: /admin");
    expect(disallowLines).toContain("Disallow: /api/");
    expect(disallowLines).toContain("Disallow: /search");
    expect(disallowLines).toContain("Disallow: /dashboard");
  });

  it("allows assistants and search crawlers to read the public catalogue", () => {
    for (const agent of ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "Bingbot"]) {
      expect(text).toContain(`User-agent: ${agent}`);
    }
    expect(text.match(/^Allow: \/$/gm)?.length).toBeGreaterThanOrEqual(6);
  });

  it("ends with a newline so the last directive is not truncated by a proxy", () => {
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });
});
