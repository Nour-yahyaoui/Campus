/**
 * Pixel "logos" for the four things the platform counts: clubs, projects,
 * events and people.
 *
 * The shapes are GitHub-style identicons — a 5×5 grid whose left half is
 * mirrored — generated from a fixed seed per kind, so a club tile looks the
 * same on the home page, on the about page and in next month's build. Colour
 * lives in the stylesheet (`[data-kind]`), so both themes get their own
 * version without a second set of shapes.
 */

export type BannerKind = "clubs" | "projects" | "events" | "users";

const SEEDS: Record<BannerKind, string> = {
  clubs: "campussphere/clubs",
  projects: "campussphere/projects",
  events: "campussphere/events",
  users: "campussphere/people",
};

const GRID = 5;

/** FNV-1a, so the same seed is the same logo everywhere, forever. */
function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** xorshift32, seeded once per kind. */
function generator(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

/**
 * The filled cells, as `[column, row]`. Columns 0 and 1 are mirrored to 4 and
 * 3; the middle column is deliberately independent so the shape is not
 * perfectly symmetrical — same trick as GitHub's avatars.
 */
/** One candidate mosaic. */
function draw(seed: number): Array<[number, number]> {
  const random = generator(seed);
  const cells: Array<[number, number]> = [];
  for (let row = 0; row < GRID; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      if (random() < 0.54) {
        cells.push([column, row]);
        if (column < 2) cells.push([GRID - 1 - column, row]);
      }
    }
  }
  return cells;
}

/**
 * A random mosaic can leave whole rows empty and read as two loose fragments.
 * Keep drawing (deterministically, from a salted seed) until every row and the
 * centre column carry something and the shape is neither a speck nor a block.
 */
function isBalanced(cells: Array<[number, number]>): boolean {
  const rows = new Set(cells.map(([, row]) => row));
  const columns = new Set(cells.map(([column]) => column));
  return rows.size === GRID && columns.size === GRID && cells.length >= 12 && cells.length <= 18;
}

export function identiconCells(kind: BannerKind): Array<[number, number]> {
  const base = hash(SEEDS[kind]);
  for (let salt = 0; salt < 512; salt += 1) {
    const cells = draw((base + Math.imul(salt, 2654435761)) >>> 0);
    if (isBalanced(cells)) return cells;
  }
  // The loop always finds one in practice; the fallback keeps the contract.
  return draw(base);
}

export const BANNER_KINDS: BannerKind[] = ["clubs", "projects", "events", "users"];
