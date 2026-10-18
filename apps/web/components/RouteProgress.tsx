"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * A three-pixel progress bar for navigations.
 *
 * Next.js streams a `loading.tsx` as soon as the route commits, but the gap
 * between the click and that commit is invisible — on a cold lambda this is the
 * longest part. There is no public router event for "navigation started", so
 * this listens to clicks on same-origin links (the same signal the internet has
 * used for a decade) and finishes when the URL actually changes.
 *
 * It is decorative: `aria-hidden`, no focus, and it never blocks a click.
 */

const START = 14;
const CREEP = 78;
const FINISH = 100;

export function RouteProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);
  const [done, setDone] = useState(false);
  const originUrl = useRef<string | null>(null);
  const creepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (creepTimer.current) clearInterval(creepTimer.current);
    if (pollTimer.current) clearInterval(pollTimer.current);
    creepTimer.current = null;
    pollTimer.current = null;
  };

  const finish = () => {
    clearTimers();
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    safetyTimer.current = null;
    originUrl.current = null;
    setProgress(FINISH);
    setDone(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setActive(false);
      setDone(false);
      setProgress(0);
    }, 320);
  };

  const start = (target: string) => {
    if (originUrl.current === target) return;
    originUrl.current = target;
    setActive(true);
    setDone(false);
    setProgress(START);

    clearTimers();
    creepTimer.current = setInterval(() => {
      setProgress((value) => (value >= CREEP ? value : value + Math.max(1, (CREEP - value) * 0.12)));
    }, 220);
    // Search-only navigations keep the same pathname, so the URL itself is the
    // completion signal rather than a router hook.
    pollTimer.current = setInterval(() => {
      if (originUrl.current && window.location.href !== originUrl.current) finish();
    }, 120);
    // A client-side form that cancels its own navigation would otherwise leave
    // the bar at 78% forever.
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    safetyTimer.current = setTimeout(finish, 10_000);
  };

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!anchor) return;
      if (anchor.getAttribute("target") === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.href === window.location.href) return;
      start(url.href);
    };

    const onPopState = () => finish();
    const onSubmit = (event: Event) => {
      // Server actions and GET forms both leave the page; give them the bar too.
      if (event.defaultPrevented) return;
      const form = event.target as HTMLFormElement | null;
      if (!form || form.getAttribute("data-no-progress") !== null) return;
      start(`${window.location.href}#pending`);
    };

    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("popstate", onPopState);
      clearTimers();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
    };
    // `start` and `finish` close over only refs and setters, so they are stable
    // enough for a listener that is attached once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A committed route change always ends the bar, including back/forward.
  useEffect(() => {
    if (active) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!active) return null;

  return (
    <div className="route-progress" data-done={done} aria-hidden="true">
      <span style={{ ["--progress" as string]: `${progress}%` }} />
    </div>
  );
}
