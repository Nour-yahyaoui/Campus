"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  ORB_COLOUR,
  orbProfile,
  orbTheme,
  viewportFor,
  type OrbTheme,
  type OrbViewport,
} from "@/lib/backdrop";

/**
 * The site's ambient backdrop: a slow orb of strands and dust behind every page.
 *
 * Three rules keep it a backdrop and not a hazard:
 *
 *  - it is `aria-hidden` and never receives pointer events, so it cannot trap a
 *    click or appear in the accessibility tree;
 *  - it obeys the same theme decision as the stylesheet (`data-theme` first,
 *    operating system second), so light pages get the ink palette and dark
 *    pages get the glow — one component, two looks;
 *  - it is never the only thing on screen: the CSS wash under the canvas is a
 *    complete rendering on its own, for reduced motion, data-saver, lost WebGL
 *    contexts and the moment before the shaders arrive.
 */

const CrystalizedBall = dynamic(() => import("@/components/CrystalizedBall"), { ssr: false });

export function SiteBackdrop() {
  const [theme, setTheme] = useState<OrbTheme | null>(null);
  const [viewport, setViewport] = useState<OrbViewport>("desktop");
  const [allowed, setAllowed] = useState(false);
  const [ready, setReady] = useState(false);

  // Wait for the first paint to settle: the orb must never compete with the
  // page for the main thread while the browser is still laying it out.
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const readTheme = () =>
      setTheme(orbTheme(document.documentElement.dataset.theme, dark.matches));
    const readViewport = () => setViewport(viewportFor(window.innerWidth));
    const readAllowed = () => {
      const nav = navigator as Navigator & {
        deviceMemory?: number;
        connection?: { saveData?: boolean };
      };
      const lowPower =
        (nav.deviceMemory ?? 8) <= 2 ||
        (nav.hardwareConcurrency ?? 8) <= 2 ||
        nav.connection?.saveData === true;
      setAllowed(!motion.matches && !lowPower);
    };

    readTheme();
    readViewport();
    readAllowed();

    // The toggle writes `data-theme` straight onto <html>; watching the
    // attribute is how the orb switches palette without a reload.
    const observer = new MutationObserver(readTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    dark.addEventListener("change", readTheme);
    motion.addEventListener("change", readAllowed);
    window.addEventListener("resize", readViewport, { passive: true });

    return () => {
      observer.disconnect();
      dark.removeEventListener("change", readTheme);
      motion.removeEventListener("change", readAllowed);
      window.removeEventListener("resize", readViewport);
    };
  }, []);

  const profile = orbProfile(viewport);
  const live = ready && allowed && theme !== null;

  return (
    <div className="site-backdrop" aria-hidden="true">
      <div className="site-backdrop__orb">
        {live ? (
          <CrystalizedBall
            preset="aurora"
            color={ORB_COLOUR[theme]}
            theme={theme}
            size={profile.size}
            particleCount={profile.particleCount}
            strands={profile.strands}
            sparks={profile.sparks}
            depth={profile.depth}
            // The defaults are tuned for a hero; a page-wide layer wants less
            // crackle and a slower drift so it stays behind the reading.
            crackle={0.45}
            flares={0.35}
            glow={0.75}
            fill={0.5}
            motion="rise"
            particleShape="square"
            sway={0.35}
            twinkle={0.45}
            haze={0.55}
            speed={0.6}
            dustSpeed={0.8}
            // Decoration only: no clicks, no hover heat, no pointer capture.
            interactive={false}
          />
        ) : null}
      </div>
    </div>
  );
}
