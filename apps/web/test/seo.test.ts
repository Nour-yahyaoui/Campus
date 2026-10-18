import { describe, expect, it } from "vitest";
import {
  absolute,
  breadcrumbJsonLd,
  clampDescription,
  jsonLdString,
  organizationJsonLd,
  websiteJsonLd,
} from "../lib/seo";

/**
 * Structured data is injected into a <script> tag, and canonical URLs end up in
 * the sitemap. Both are easy to get subtly wrong in a way no type checker
 * notices, so they are tested directly.
 */
describe("seo helpers", () => {
  it("builds absolute URLs without doubling the slash", () => {
    expect(absolute("/")).toMatch(/^https?:\/\/[^/]+$/);
    expect(absolute("/clubs")).toMatch(/\/clubs$/);
    expect(absolute("clubs")).toMatch(/\/clubs$/);
    expect(absolute("/clubs")).not.toContain("//clubs");
  });

  it("clamps a description at a word boundary", () => {
    const long = "word ".repeat(80);
    const clamped = clampDescription(long, 60);
    expect(clamped.length).toBeLessThanOrEqual(61);
    expect(clamped.endsWith("…")).toBe(true);
    expect(clamped).not.toContain("  ");
  });

  it("leaves a short description alone and collapses whitespace", () => {
    expect(clampDescription("  A  short\n description ")).toBe("A short description");
  });

  it("escapes a closing script tag so JSON-LD cannot break out", () => {
    const payload = jsonLdString({ name: "Evil </script><img src=x onerror=alert(1)>" });
    expect(payload).not.toContain("</script>");
    expect(payload).toContain("\\u003c/script>");
    // Still valid JSON once parsed back.
    expect(JSON.parse(payload).name).toContain("</script>");
  });

  it("describes the site with the sitelinks search box", () => {
    const site = websiteJsonLd() as Record<string, any>;
    expect(site["@type"]).toBe("WebSite");
    expect(site.potentialAction["@type"]).toBe("SearchAction");
    expect(site.potentialAction.target.urlTemplate).toContain("/search?q={search_term_string}");
  });

  it("links the organisation node to every page by id", () => {
    const org = organizationJsonLd() as Record<string, any>;
    expect(org["@id"]).toMatch(/#organization$/);
    expect(org.sameAs).toContain("https://github.com/Nour-yahyaoui/Campus");
  });

  it("numbers breadcrumb items from one, with absolute urls", () => {
    const crumbs = breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Clubs", path: "/clubs" },
      { name: "Robotics", path: "/clubs/robotics" },
    ]) as Record<string, any>;
    expect(crumbs.itemListElement.map((item: any) => item.position)).toEqual([1, 2, 3]);
    expect(crumbs.itemListElement[2].item).toMatch(/\/clubs\/robotics$/);
  });
});
