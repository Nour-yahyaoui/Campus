"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A live demonstration of the navigation affordances, for the design gallery
 * under `/dev/states`. It drives the same CSS the real bar uses, so what you see
 * here is exactly what a route change renders.
 */
export function ProgressDemo() {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [running, setRunning] = useState(false);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const play = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRunning(true);
    setDone(false);
    setProgress(12);
    [0, 1, 2, 3, 4].forEach((step) => {
      timers.current.push(
        setTimeout(() => setProgress((current) => Math.min(86, current + (86 - current) * 0.35)), 180 * (step + 1)),
      );
    });
    timers.current.push(
      setTimeout(() => {
        setProgress(100);
        setDone(true);
      }, 1150),
    );
    timers.current.push(
      setTimeout(() => {
        setRunning(false);
        setDone(false);
        setProgress(0);
      }, 1550),
    );
  };

  return (
    <div className="stack">
      <button type="button" className="btn btn-primary" onClick={play} disabled={running}>
        {running ? <span className="btn-spinner" aria-hidden="true" /> : null}
        {running ? "Navigating…" : "Show the navigation bar"}
      </button>
      <div className="demo-track" aria-hidden="true">
        <span style={{ ["--progress" as string]: `${progress}%` }} data-done={done} />
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        On the real site the bar is fixed to the top edge of the viewport and starts on{" "}
        <code>pointerdown</code>, so it appears with the press rather than after the page has loaded.
      </p>
    </div>
  );
}
