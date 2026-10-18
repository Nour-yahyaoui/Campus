"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * The navigation bar.
 *
 * Next.js streams a `loading.tsx` as soon as the route commits, but the gap
 * between the tap and that commit is invisible — on a cold lambda it is the
 * longest part of the interaction. There is no public router event for
 * "navigation started", so this listens to pointer presses on same-origin links
 * (the same signal browsers have used for a decade) and finishes when the URL
 * actually changes.
 *
 * Two details make it feel right rather than merely exist:
 *  - it starts on `pointerdown`, not `click`, so the response is simultaneous
 *    with the press;
 *  - it stays on screen for at least MIN_VISIBLE_MS. A flash of a bar that
 *    disappears in 40 ms reads as a glitch, and a minimum duration is what
 *    every mature progress bar (YouTube, GitHub, Vercel) does.
 *
 * It is decorative: `aria-hidden`, no focus, never blocks a click.
 */

const START = 12;
const CREEP = 82;
const FINISH = 100;
const MIN_VISIBLE_MS = 420;

export function RouteProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);
  const [done, setDone] = useState(false);
  const originUrl = useRef<string | null>(null);
  const startedAt = useRef(0);
  const creepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (creepTimer.current) clearInterval(creepTimer.current);
    if (pollTimer.current) clearInterval(pollTimer.current);
    creepTimer.current = null;
    pollTimer.current = null;
  };

  const hide = () => {
    setActive(false);
    setDone(false);
    setProgress(0);
    delete document.documentElement.dataset.navigating;
  };

  const finish = () => {
    clearTimers();
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    safetyTimer.current = null;
    originUrl.current = null;
    setProgress(FINISH);
    setDone(true);

    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - startedAt.current));
    settleTimer.current = setTimeout(() => {
      hide();
    }, remaining + 220);
  };

  const start = (target: string) => {
    if (originUrl.current === target) return;
    originUrl.current = target;
    startedAt.current = Date.now();
    setActive(true);
    setDone(false);
    setProgress(START);
    document.documentElement.dataset.navigating = "true";

    clearTimers();
    creepTimer.current = setInterval(() => {
      setProgress((value) => (value >= CREEP ? value : value + Math.max(1, (CREEP - value) * 0.12)));
    }, 200);
    // Search-only navigations keep the same pathname, so the URL itself is the
    // completion signal rather than a router hook.
    pollTimer.current = setInterval(() => {
      if (originUrl.current && window.location.href !== originUrl.current) finish();
    }, 100);
    // A client-side form that cancels its own navigation would otherwise leave
    // the bar at 82% forever.
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    safetyTimer.current = setTimeout(finish, 10_000);
  };

  useEffect(() => {
    const targetFor = (event: Event): string | null => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!anchor) return null;
      if (anchor.getAttribute("target") === "_blank" || anchor.hasAttribute("download")) return null;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return null;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return null;
      }
      if (url.origin !== window.location.origin) return null;
      if (url.href === window.location.href) return null;
      return url.href;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = targetFor(event);
      if (target) start(target);
    };

    const onClick = (event: MouseEvent) => {
      // Keyboard activation (Enter) never fires pointerdown.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = targetFor(event);
      if (target) start(target);
    };

    const onPopState = () => finish();
    const onSubmit = (event: Event) => {
      // Server actions and GET forms both leave the page; give them the bar too.
      if (event.defaultPrevented) return;
      const form = event.target as HTMLFormElement | null;
      if (!form || form.getAttribute("data-no-progress") !== null) return;
      start(`${window.location.href}#pending`);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("popstate", onPopState);
      clearTimers();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
      delete document.documentElement.dataset.navigating;
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
