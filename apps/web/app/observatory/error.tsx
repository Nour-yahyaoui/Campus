"use client";

import { useEffect } from "react";
import { RetryPanel } from "@/components/RetryPanel";

/**
 * The Observatory is allowed to say it cannot measure something. When the whole
 * snapshot fails, it says that instead of inventing a zero.
 */
export default function ObservatoryError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ui] observatory error", error.digest ?? error.message);
  }, [error]);

  return (
    <RetryPanel
      title="The Observatory is unavailable"
      eyebrow="No measurement"
      message="The metrics snapshot could not be read. This page would rather show an error than show zeros that look like a healthy system."
      digest={error.digest}
      onRetry={reset}
    />
  );
}
