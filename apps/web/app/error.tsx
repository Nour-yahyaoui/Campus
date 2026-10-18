"use client";

import { useEffect } from "react";
import { RetryPanel } from "@/components/RetryPanel";

/**
 * Route-level error boundary. It replaces the page but keeps the header,
 * footer and navigation, so a failed club page does not strand the visitor.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ui] route error", error.digest ?? error.message);
  }, [error]);

  return (
    <RetryPanel
      title="This page didn’t load"
      message="The server could not finish rendering it — usually a slow database or a deploy in progress. Nothing you did was lost."
      digest={error.digest}
      onRetry={reset}
    />
  );
}
