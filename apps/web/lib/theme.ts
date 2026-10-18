/**
 * Theme choice, kept as three states rather than a boolean.
 *
 * "System" is the default and is not the same as "light": it means the reader
 * has not decided, so `prefers-color-scheme` decides for them — including when
 * their operating system switches at sunset. Once they pick a side, that choice
 * wins and is stored in a cookie so the server can render it on the very first
 * paint. No inline script, no flash of the wrong theme, nothing for the CSP to
 * block.
 */

export const THEME_COOKIE = "cs_theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_LABEL: Record<ThemeChoice, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

const ORDER: ThemeChoice[] = ["light", "dark", "system"];

/** Anything unrecognised — including a tampered cookie — means "no opinion". */
export function parseTheme(value: string | undefined | null): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

/** The value for `<html data-theme>`; `undefined` lets the media query decide. */
export function themeAttribute(choice: ThemeChoice): "light" | "dark" | undefined {
  return choice === "system" ? undefined : choice;
}

export function nextTheme(choice: ThemeChoice): ThemeChoice {
  return ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]!;
}

/** The `document.cookie` string for a choice, empty value meaning "forget it". */
export function themeCookie(choice: ThemeChoice): string {
  if (choice === "system") {
    return `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }
  return `${THEME_COOKIE}=${choice}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
}
