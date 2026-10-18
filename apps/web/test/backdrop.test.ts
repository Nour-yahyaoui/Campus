import { describe, expect, it } from "vitest";
import { ORB_COLOUR, orbProfile, orbTheme, viewportFor } from "../lib/backdrop";

/**
 * The backdrop has no snapshot to compare against, so these tests pin the two
 * decisions that would be invisible until they were wrong in production: which
 * theme the orb believes it is in, and how much work it asks of a phone.
 */

describe("the backdrop's theme", () => {
  it("follows an explicit choice even when the system disagrees", () => {
    expect(orbTheme("dark", false)).toBe("dark");
    expect(orbTheme("light", true)).toBe("light");
  });

  it("follows the system when nobody has chosen", () => {
    expect(orbTheme(undefined, true)).toBe("dark");
    expect(orbTheme(undefined, false)).toBe("light");
  });

  it("treats a tampered value as no choice at all", () => {
    expect(orbTheme("purple", false)).toBe("light");
    expect(orbTheme("", true)).toBe("dark");
  });
});

describe("the backdrop's cost", () => {
  it("uses the same widths as the stylesheet", () => {
    expect(viewportFor(390)).toBe("phone");
    expect(viewportFor(639)).toBe("phone");
    expect(viewportFor(640)).toBe("tablet");
    expect(viewportFor(1023)).toBe("tablet");
    expect(viewportFor(1024)).toBe("desktop");
  });

  it("never asks a smaller screen to do more work", () => {
    const phone = orbProfile("phone");
    const tablet = orbProfile("tablet");
    const desktop = orbProfile("desktop");
    expect(phone.particleCount).toBeLessThan(tablet.particleCount);
    expect(tablet.particleCount).toBeLessThan(desktop.particleCount);
    expect(phone.strands).toBeLessThanOrEqual(desktop.strands);
    // The engine's own ceiling is 24,000; anything near it on a phone would
    // drain the battery for a decoration.
    for (const profile of [phone, tablet, desktop]) {
      expect(profile.particleCount).toBeLessThanOrEqual(12000);
      expect(profile.size).toBeGreaterThan(0);
      expect(profile.size).toBeLessThanOrEqual(1);
    }
  });

  it("draws a different colour in each theme", () => {
    expect(ORB_COLOUR.light).not.toBe(ORB_COLOUR.dark);
    expect(ORB_COLOUR.light).toMatch(/^#[0-9a-f]{6}$/i);
    expect(ORB_COLOUR.dark).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
