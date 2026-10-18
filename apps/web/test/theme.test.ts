import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The dark theme is only correct if it is *complete*. These tests read the real
 * stylesheet and check three things a screenshot cannot: that both themes
 * define exactly the same tokens, that every token a rule uses actually exists,
 * and that each text/background pair clears WCAG AA in both themes.
 */

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

/** The declarations of the first block matching `opener`. */
function block(opener: string): string {
  const start = css.indexOf(opener);
  if (start === -1) throw new Error(`missing block: ${opener}`);
  let depth = 0;
  let i = css.indexOf("{", start);
  const from = i;
  for (; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(from, i + 1);
    }
  }
  throw new Error(`unclosed block: ${opener}`);
}

function tokens(source: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of source.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    found[match[1]!] = match[2]!.trim();
  }
  return found;
}

const light = tokens(block(":root {"));
const darkMedia = tokens(block("@media (prefers-color-scheme: dark)"));
const darkExplicit = tokens(block(':root[data-theme="dark"]'));

/** Geometry, fonts and breakpoints live only in `:root`; colours do not. */
const isColour = (value: string): boolean =>
  /(#[0-9a-f]{3,8}\b|rgba?\(|color-mix\(|var\(--)/i.test(value.trim());

const colourTokens = (source: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(source).filter(([, value]) => isColour(value)));

/* ------------------------------------------------------------------ */
/* Completeness                                                        */
/* ------------------------------------------------------------------ */

describe("the dark theme", () => {
  it("redefines every colour the light theme declares, and nothing else", () => {
    const lightColours = Object.keys(colourTokens(light)).sort();
    expect(Object.keys(darkMedia).sort()).toEqual(lightColours);
    expect(Object.keys(darkExplicit).sort()).toEqual(lightColours);
    // Same values too: the media query and the explicit choice must not drift.
    expect(darkMedia).toEqual(darkExplicit);
  });

  it("never leaves a rule pointing at a token nobody defines", () => {
    const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1]!));
    // `--progress` is set per element from the React style attribute, never here.
    const providedElsewhere = new Set(["--progress"]);
    const missing = [...used].filter((name) => !(name in light) && !providedElsewhere.has(name));
    expect(missing).toEqual([]);
  });

  it("declares only colour, so every breakpoint behaves exactly as in light", () => {
    for (const source of [darkMedia, darkExplicit]) {
      for (const [name, value] of Object.entries(source)) {
        // Token blocks may only redefine custom properties.
        expect(name.startsWith("--")).toBe(true);
        expect(value).not.toMatch(/url\(|url "/);
      }
    }
  });

  it("keeps the stylesheet free of hard-coded surface colours", () => {
    const outsideTokens = css
      .replace(block(":root {"), "")
      .replace(block("@media (prefers-color-scheme: dark)"), "")
      .replace(block(':root[data-theme="dark"]'), "");
    const literals = [...outsideTokens.matchAll(/(?:color|background|border-color)\s*:\s*(#[0-9a-f]{3,8})/gi)]
      // The QR code has to stay on white in both themes.
      .map((match) => match[1]!)
      .filter((value) => value !== "#fff" && value !== "#ffffff");
    expect(literals).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Contrast                                                            */
/* ------------------------------------------------------------------ */

const rgb = (hex: string): [number, number, number] => {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? [...clean].map((character) => character + character).join("")
      : clean;
  return [0, 2, 4].map((index) => Number.parseInt(full.slice(index, index + 2), 16)) as [
    number,
    number,
    number,
  ];
};

const luminance = (hex: string): number => {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const ratio = (a: string, b: string): number => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
};

const PAIRS: Array<[theme: string, foreground: string, background: string, label: string]> = [
  ["light", "ink", "paper", "body text"],
  ["light", "ink-soft", "paper", "secondary text"],
  ["light", "ink-muted", "paper", "muted text"],
  ["light", "ink-muted", "paper-raised", "muted text on cards"],
  ["light", "link", "paper", "links"],
  ["light", "accent-ink", "forest-soft", "text on soft green"],
  ["light", "on-brand", "forest", "text on filled buttons"],
  ["light", "marigold-ink", "marigold-soft", "text on soft amber"],
  ["light", "danger-ink", "danger-soft", "text on soft red"],
  ["dark", "ink", "paper", "body text"],
  ["dark", "ink-soft", "paper", "secondary text"],
  ["dark", "ink-muted", "paper", "muted text"],
  ["dark", "ink-muted", "paper-raised", "muted text on cards"],
  ["dark", "link", "paper", "links"],
  ["dark", "link", "paper-raised", "links on cards"],
  ["dark", "accent-ink", "forest-soft", "text on soft green"],
  ["dark", "on-brand", "forest", "text on filled buttons"],
  ["dark", "marigold-ink", "marigold-soft", "text on soft amber"],
  ["dark", "danger-ink", "danger-soft", "text on soft red"],
];

describe("legibility in both themes", () => {
  const palette = (theme: string) => (theme === "light" ? light : darkExplicit);

  for (const [theme, foreground, background, label] of PAIRS) {
    it(`${theme}: ${label} clears WCAG AA`, () => {
      const tokensOfTheme = palette(theme);
      const fg = tokensOfTheme[`--${foreground}`]!;
      const bg = tokensOfTheme[`--${background}`]!;
      expect(fg).toMatch(/^#[0-9a-f]{3,8}$/i);
      expect(bg).toMatch(/^#[0-9a-f]{3,8}$/i);
      const contrast = ratio(fg, bg);
      expect(contrast, `${theme} ${foreground} on ${background} = ${contrast.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("keeps non-text surfaces distinguishable from the page", () => {
    for (const theme of ["light", "dark"] as const) {
      const paletteOfTheme = palette(theme);
      expect(ratio(paletteOfTheme["--line"]!, paletteOfTheme["--paper"]!)).toBeGreaterThan(1.15);
      expect(ratio(paletteOfTheme["--paper-raised"]!, paletteOfTheme["--paper"]!)).toBeGreaterThan(1.02);
    }
  });
});
