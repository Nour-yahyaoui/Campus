"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Last line of defence: the root layout itself failed, so this component
 * replaces `<html>` and `<body>`. It cannot use the site header, the session or
 * any data — only the error and a reset function.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ui] root layout error", error.digest ?? error.message);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main id="main" className="site-main">
          <div className="shell" style={{ maxWidth: 620, paddingTop: 64 }}>
            <p className="eyebrow">Something broke</p>
            <h1>CampusSphere couldn’t start this page.</h1>
            <p className="lede">
              The layout failed before anything could render. The error was logged; trying again is safe.
            </p>
            {error.digest ? <p className="mono small muted">Reference: {error.digest}</p> : null}
            <div className="row mt-2">
              <button className="btn btn-primary" type="button" onClick={reset}>
                Try again
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => window.location.reload()}>
                Reload page
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
