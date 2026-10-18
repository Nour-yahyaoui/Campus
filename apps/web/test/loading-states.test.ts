import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A route without a `loading.tsx` is a route that appears to do nothing when
 * clicked. This test makes the coverage a rule rather than a habit: every page
 * must sit under a loading boundary, and every boundary must be a real
 * component.
 */

const appDir = fileURLToPath(new URL("../app", import.meta.url));

function pageFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "api") continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      // Route groups do not create segments; their children still need coverage.
      found.push(...pageFiles(full));
    } else if (entry.name === "page.tsx") {
      found.push(full);
    }
  }
  return found;
}

function hasLoadingBoundary(directory: string): boolean {
  let current = directory;
  while (current.startsWith(appDir)) {
    if (existsSync(path.join(current, "loading.tsx"))) return true;
    if (current === appDir) break;
    current = path.dirname(current);
  }
  return false;
}

describe("loading boundaries", () => {
  const pages = pageFiles(appDir);

  it("finds the pages it is supposed to guard", () => {
    expect(pages.length).toBeGreaterThan(15);
  });

  it.each(pages.map((file) => [path.relative(appDir, path.dirname(file)) || ".", file] as const))(
    "%s has a loading state",
    (_route, file) => {
      expect(hasLoadingBoundary(path.dirname(file))).toBe(true);
    },
  );

  it("every loading file is a default-exported component", () => {
    const loadingFiles: string[] = [];
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === "loading.tsx") loadingFiles.push(full);
      }
    };
    walk(appDir);

    expect(loadingFiles.length).toBeGreaterThanOrEqual(20);
    for (const file of loadingFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toMatch(/export default function/);
      // Each boundary must render a skeleton, either inline or through one of
      // the shared shapes in components/Skeletons.tsx.
      expect(source, file).toMatch(/Skeleton/);
    }
  });

  it("announces loading to assistive technology", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../components/Skeletons.tsx", import.meta.url)),
      "utf8",
    );
    expect(source).toContain('role="status"');
    expect(source).toContain("aria-busy");
    expect(source).toContain("sr-only");
  });

  it("ships a root error boundary and a last-resort one", () => {
    expect(existsSync(path.join(appDir, "error.tsx"))).toBe(true);
    expect(existsSync(path.join(appDir, "global-error.tsx"))).toBe(true);
    for (const segment of ["dashboard", "admin", "observatory"]) {
      expect(existsSync(path.join(appDir, segment, "error.tsx")), segment).toBe(true);
    }
  });
});
