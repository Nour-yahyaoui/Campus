"use client";

import { useState } from "react";
import {
  THEME_LABEL,
  nextTheme,
  themeAttribute,
  themeCookie,
  type ThemeChoice,
} from "@/lib/theme";

/**
 * Light / Dark / System, cycled by one button.
 *
 * The server already rendered `data-theme` from the cookie, so this component
 * never disagrees with the first paint. Clicking writes the cookie and flips the
 * attribute directly — no request, no re-render of the tree, and a reload lands
 * on the same choice because the server reads it back.
 */

function Icon({ choice }: { choice: ThemeChoice }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (choice === "dark") {
    return (
      <svg {...common}>
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
      </svg>
    );
  }
  if (choice === "light") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ThemeToggle({ initial }: { initial: ThemeChoice }) {
  const [choice, setChoice] = useState<ThemeChoice>(initial);

  function apply(next: ThemeChoice) {
    const root = document.documentElement;
    const attribute = themeAttribute(next);
    if (attribute) root.dataset.theme = attribute;
    else delete root.dataset.theme;
    document.cookie = themeCookie(next);
    setChoice(next);
  }

  const next = nextTheme(choice);

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => apply(next)}
      title={`Theme: ${THEME_LABEL[choice]}. Switch to ${THEME_LABEL[next]}.`}
    >
      <Icon choice={choice} />
      <span className="theme-toggle-label">{THEME_LABEL[choice]}</span>
      <span className="sr-only" aria-live="polite">
        {`Theme is ${THEME_LABEL[choice].toLowerCase()}. Next: ${THEME_LABEL[next]}.`}
      </span>
    </button>
  );
}
