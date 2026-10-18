"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

/**
 * Re-fetch the current page without a full reload.
 *
 * Used where the data genuinely moves — the Observatory's counters and the
 * moderation queues — so a reader does not have to guess whether they are
 * looking at a stale snapshot. `router.refresh()` keeps scroll position and
 * client state, and `isPending` gives the button an honest busy state.
 */
export function RefreshButton({
  label = "Refresh",
  className = "btn btn-secondary",
  updatedAt,
}: {
  label?: string;
  className?: string;
  updatedAt?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [at, setAt] = useState(updatedAt);

  useEffect(() => {
    setAt(updatedAt);
  }, [updatedAt]);

  return (
    <div className="row" style={{ gap: 10, alignItems: "center" }}>
      <button
        type="button"
        className={className}
        aria-busy={pending}
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            router.refresh();
            setAt(new Date().toISOString());
          })
        }
      >
        {pending ? <span className="btn-spinner" aria-hidden="true" /> : null}
        {pending ? "Refreshing…" : label}
      </button>
      {at ? (
        <span className="tiny muted" aria-live="polite">
          {pending ? "Fetching a new snapshot" : `Snapshot from ${new Date(at).toLocaleTimeString()}`}
        </span>
      ) : null}
    </div>
  );
}
