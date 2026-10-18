import { describe, expect, it } from "vitest";
import { BANNER_KINDS, identiconCells } from "../lib/banner";

/**
 * A logo has to be stable, or it is just noise. These tests pin the shape of
 * the generated mosaics: same cells every render, mirrored like an identicon,
 * dense enough to read at 46 px, and different for each kind.
 */

describe("the pixel banners", () => {
  it("draws the same logo every time", () => {
    const first = JSON.stringify(identiconCells("clubs"));
    identiconCells("projects");
    expect(JSON.stringify(identiconCells("clubs"))).toBe(first);
  });

  it("mirrors the left half like an identicon", () => {
    for (const kind of BANNER_KINDS) {
      const cells = identiconCells(kind);
      const set = new Set(cells.map(([x, y]) => `${x}:${y}`));
      for (const [x, y] of cells) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(5);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThan(5);
        if (x < 2) expect(set.has(`${4 - x}:${y}`)).toBe(true);
      }
    }
  });

  it("is dense enough to read at banner size", () => {
    for (const kind of BANNER_KINDS) {
      expect(identiconCells(kind).length).toBeGreaterThanOrEqual(8);
    }
  });

  it("gives each kind its own shape", () => {
    const shapes = BANNER_KINDS.map((kind) => JSON.stringify(identiconCells(kind)));
    expect(new Set(shapes).size).toBe(BANNER_KINDS.length);
  });
});
