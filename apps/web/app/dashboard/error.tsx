"use client";

import { useEffect } from "react";
import { RetryPanel } from "@/components/RetryPanel";

/** Keeps the dashboard shell alive when one of its panels fails. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ui] dashboard error", error.digest ?? error.message);
  }, [error]);

  return (
    <RetryPanel
      title="Your dashboard didn’t load"
      eyebrow="Dashboard"
      message="One of the panels failed to fetch. Your account, memberships and registrations are unaffected — this is a display problem, not a data problem."
      digest={error.digest}
      onRetry={reset}
    />
  );
}
