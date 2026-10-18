import { describe, expect, it } from "vitest";
import { categoryLabel, formatDate, formatDateTime, formatRelative, numeric, percent, titleCase } from "../lib/format";

describe("presentation helpers", () => {
  it("renders categories from the shared label map with a safe fallback", () => {
    expect(categoryLabel("campus-improvement")).toBe("Campus improvement");
    expect(categoryLabel("technology")).toBe("Technology");
    expect(categoryLabel(null)).toBe("General");
  });

  it("formats dates in a stable, timezone-aware way", () => {
    expect(formatDate("2026-03-01T10:00:00.000Z")).toBe("1 Mar 2026");
    expect(formatDateTime("2026-03-01T10:00:00.000Z", "Africa/Tunis")).toContain("2026");
    expect(formatDate(null)).toBe("—");
  });

  it("describes past activity without inventing precision", () => {
    expect(formatRelative(new Date(Date.now() - 60_000).toISOString())).toContain("minute");
    expect(formatRelative(new Date(Date.now() - 3 * 86_400_000).toISOString())).toContain("day");
  });

  it("formats numbers and percentages the way the Observatory expects", () => {
    expect(numeric(1234)).toBe("1,234");
    expect(numeric(null)).toBe("—");
    expect(percent(0.0123)).toBe("1.2%");
    expect(titleCase("under_review")).toBe("Under Review");
  });
});
