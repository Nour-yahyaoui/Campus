/**
 * Numbers and colour for the site backdrop, kept out of the React component so
 * they can be tested without a WebGL context.
 *
 * The orb is decoration, so everything here is chosen for two things: it must
 * never be the reason a page is hard to read, and it must never be the reason a
 * phone gets hot. Both end up as small numbers — opacity in CSS, particle
 * counts here.
 */

export type OrbTheme = "light" | "dark";
export type OrbViewport = "phone" | "tablet" | "desktop";

/**
 * The orb keeps the site's own palette: forest in the light theme, a brighter
 * mint at night. The engine builds its whole palette from this one colour.
 */
export const ORB_COLOUR: Record<OrbTheme, string> = {
  light: "#2f6b4c",
  dark: "#8fe3b0",
};

export interface OrbProfile {
  /** Dust particles. The strands are drawn by the fragment shader, not these. */
  particleCount: number;
  strands: number;
  sparks: number;
  /** Orb diameter as a fraction of the canvas box. */
  size: number;
  depth: number;
}

const PROFILES: Record<OrbViewport, OrbProfile> = {
  // A phone has roughly a quarter of the pixels of a laptop and a quarter of
  // the patience: 4,200 particles still reads as a dust cloud, and the orb is
  // wider relative to the screen so it does not look lost.
  phone: { particleCount: 4200, strands: 4, sparks: 0.18, size: 0.86, depth: 0.45 },
  tablet: { particleCount: 7200, strands: 5, sparks: 0.22, size: 0.78, depth: 0.5 },
  desktop: { particleCount: 11000, strands: 5, sparks: 0.26, size: 0.68, depth: 0.55 },
};

export function orbProfile(viewport: OrbViewport): OrbProfile {
  return PROFILES[viewport];
}

/**
 * `data-theme` wins when it exists — that is the reader's explicit choice,
 * including "light" on a machine whose system is dark. Without it the reader
 * never chose, so the operating system decides, exactly as the stylesheet does.
 */
export function orbTheme(attribute: string | undefined, prefersDark: boolean): OrbTheme {
  if (attribute === "light" || attribute === "dark") return attribute;
  return prefersDark ? "dark" : "light";
}

/** Width buckets that match the stylesheet's own breakpoints. */
export function viewportFor(width: number): OrbViewport {
  if (width < 640) return "phone";
  if (width < 1024) return "tablet";
  return "desktop";
}
