import { describe, expect, it } from "vitest";
import { safeNext } from "../lib/next-path";

describe("safeNext", () => {
  it("keeps ordinary in-app paths", () => {
    expect(safeNext("/clubs")).toBe("/clubs");
    expect(safeNext("/dashboard/events/abc?tab=tickets")).toBe("/dashboard/events/abc?tab=tickets");
    expect(safeNext("/login?next=%2Fclubs").startsWith("/login")).toBe(true);
  });

  it("falls back when nothing was asked for", () => {
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
  });

  it("refuses other origins", () => {
    expect(safeNext("https://evil.example/steal")).toBe("/dashboard");
    expect(safeNext("//evil.example/steal")).toBe("/dashboard");
    expect(safeNext("http://evil.example")).toBe("/dashboard");
    expect(safeNext("javascript:alert(1)")).toBe("/dashboard");
  });

  it("refuses backslash and control-character tricks", () => {
    // Browsers read `\` as `/`, so `/\evil.example` is `//evil.example`.
    expect(safeNext("/\\evil.example/steal")).toBe("/dashboard");
    expect(safeNext("/\\/evil.example")).toBe("/dashboard");
    // Tabs and newlines are stripped while parsing and can revive `//`.
    expect(safeNext("/\t/evil.example")).toBe("/dashboard");
    expect(safeNext("/\n/evil.example")).toBe("/dashboard");
    expect(safeNext("/\u0000/evil.example")).toBe("/dashboard");
  });

  it("normalises dot segments without leaving the app", () => {
    expect(safeNext("/clubs/../dashboard")).toBe("/dashboard");
    expect(safeNext("/./clubs")).toBe("/clubs");
  });
});
