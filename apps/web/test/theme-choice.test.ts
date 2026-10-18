import { describe, expect, it } from "vitest";
import {
  THEME_COOKIE,
  nextTheme,
  parseTheme,
  themeAttribute,
  themeCookie,
} from "../lib/theme";

describe("theme choice", () => {
  it("treats anything unrecognised as 'follow the system'", () => {
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme("")).toBe("system");
    expect(parseTheme("purple")).toBe("system");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
  });

  it("only writes data-theme when the reader actually chose", () => {
    expect(themeAttribute("system")).toBeUndefined();
    expect(themeAttribute("dark")).toBe("dark");
    expect(themeAttribute("light")).toBe("light");
  });

  it("cycles light -> dark -> system and back", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
    expect(nextTheme("system")).toBe("light");
  });

  it("expires the cookie when the reader returns to the system theme", () => {
    const system = themeCookie("system");
    expect(system).toContain(`${THEME_COOKIE}=;`);
    expect(system).toContain("max-age=0");
    const dark = themeCookie("dark");
    expect(dark).toContain(`${THEME_COOKIE}=dark`);
    expect(dark).toContain("path=/");
    // Readable by the client on purpose: the toggle writes it without a request.
    expect(dark).not.toContain("httponly");
  });
});
