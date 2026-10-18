"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ui] route error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="shell" style={{ maxWidth: 620, paddingTop: 64 }}>
      <p className="eyebrow">Something broke</p>
      <h1>We couldn&apos;t render this page.</h1>
      <p className="lede">
        The error was logged with a correlation id. If it keeps happening, the status page and repository
        issue tracker are the right places to look.
      </p>
      {error.digest ? <p className="mono small muted">Reference: {error.digest}</p> : null}
      <div className="row mt-2">
        <button className="btn btn-primary" type="button" onClick={reset}>Try again</button>
        <Link className="btn btn-secondary" href="/">Home</Link>
        <Link className="btn btn-secondary" href="/about#status">Status</Link>
      </div>
    </div>
  );
}
