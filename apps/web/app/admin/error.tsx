"use client";

import { useEffect } from "react";
import { RetryPanel } from "@/components/RetryPanel";

/** Admin surfaces hide nothing: the message names the console and the reference. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ui] admin error", error.digest ?? error.message);
  }, [error]);

  return (
    <RetryPanel
      title="The admin console didn’t load"
      eyebrow="Admin"
      message="The request failed before the console could render. No moderation action was applied — decisions are only written after the page loads."
      digest={error.digest}
      onRetry={reset}
    />
  );
}
