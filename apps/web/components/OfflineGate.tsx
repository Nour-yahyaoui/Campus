"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RetryPanel } from "./RetryPanel";

/**
 * Watches the connection and explains the one failure the server cannot fix.
 *
 * When a laptop wakes up on a train, every link appears to do nothing. Saying
 * "you are offline" — and refreshing automatically the moment the connection
 * returns — turns a mystery into an inconvenience.
 */
export function OfflineGate() {
  const router = useRouter();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) setOffline(true);

    const onOffline = () => setOffline(true);
    const onOnline = () => {
      setOffline(false);
      // The page the user was trying to reach is one refresh away.
      router.refresh();
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [router]);

  if (!offline) return null;

  return (
    <RetryPanel
      eyebrow="No connection"
      title="You’re offline"
      message="This device lost its network connection. Everything already on the page still works; new pages will load again as soon as the connection is back."
      autoAfter={null}
      onRetry={() => {
        if (typeof navigator !== "undefined" && navigator.onLine) {
          setOffline(false);
          router.refresh();
        }
      }}
    />
  );
}
