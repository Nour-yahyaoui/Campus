"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The one screen a failure gets.
 *
 * A dead page with a stack trace is the worst possible answer to "the database
 * blinked". This panel says what happened, gives the reference an operator can
 * search for, and offers the only two actions that actually help: try the same
 * thing again, or go somewhere that works.
 *
 * Transient failures are usually just that — a request lost between the lambda
 * and PostgreSQL — so the first render counts down and retries once on its own.
 * The budget is global: two automatic attempts per session, then it waits for a
 * human, so a persistent outage cannot spin the browser.
 */

let automaticAttempts = 0;
const MAX_AUTOMATIC = 2;

export interface RetryPanelProps {
  title?: string;
  eyebrow?: string;
  message?: React.ReactNode;
  digest?: string;
  onRetry?: () => void;
  autoAfter?: number | null;
  /** Extra buttons, for example "Reload" or a link to the status section. */
  children?: React.ReactNode;
}

export function RetryPanel({
  title = "This page didn’t load",
  eyebrow = "Something broke",
  message = "The request failed before the page could be rendered. Nothing you did was lost, and trying again usually works.",
  digest,
  onRetry,
  autoAfter = 5,
  children,
}: RetryPanelProps) {
  const retryRef = useRef(onRetry);
  retryRef.current = onRetry;

  const [seconds, setSeconds] = useState<number | null>(() =>
    onRetry && autoAfter && automaticAttempts < MAX_AUTOMATIC ? autoAfter : null,
  );
  const [pending, setPending] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const retryButton = useRef<HTMLButtonElement>(null);

  const retry = useCallback(() => {
    if (!retryRef.current) return;
    automaticAttempts += 1;
    setSeconds(null);
    setPending(true);
    retryRef.current();
  }, []);

  useEffect(() => {
    if (seconds === null) return;
    if (seconds <= 0) {
      automaticAttempts += 1;
      setPending(true);
      retryRef.current?.();
      return;
    }
    const timer = setTimeout(() => setSeconds((value) => (value === null ? null : value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  useEffect(() => {
    retryButton.current?.focus();
  }, []);

  const copyReference = async () => {
    if (!digest) return;
    try {
      await navigator.clipboard.writeText(digest);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard permission denied — the reference is visible on screen */
    }
  };

  const actions = (
    <div className="modal-actions">
      {onRetry ? (
        <button ref={retryButton} type="button" className="btn btn-primary" onClick={retry} aria-busy={pending}>
          {pending ? <span className="btn-spinner" aria-hidden="true" /> : null}
          {pending ? "Trying again…" : "Try again"}
        </button>
      ) : null}
      <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
        Reload page
      </button>
      <Link className="btn btn-secondary" href="/">
        Go home
      </Link>
      {children}
    </div>
  );

  const body = (
    <>
      <p className="eyebrow">{eyebrow}</p>
      <h1 id="retry-title">{title}</h1>
      <p>{message}</p>
      {digest ? (
        <p className="mono small muted" style={{ marginTop: 10 }}>
          Reference: {digest}
        </p>
      ) : null}
      {actions}
      <p className="modal-foot">
        {seconds !== null ? (
          <>
            Retrying automatically in {seconds}s.
            <button type="button" className="linkish" onClick={() => setSeconds(null)}>
              Cancel
            </button>
          </>
        ) : digest ? (
          <>
            Quote the reference when reporting this.
            <button type="button" className="linkish" onClick={copyReference}>
              {copied ? "Copied" : "Copy it"}
            </button>
          </>
        ) : (
          <>If it keeps happening, the repository issue tracker is the right place to look.</>
        )}
      </p>
    </>
  );

  if (dismissed) {
    return (
      <div className="shell" style={{ maxWidth: 620, paddingTop: 48 }}>
        <section className="card" role="alert">
          {body}
        </section>
      </div>
    );
  }

  return (
    <div className="shell" style={{ maxWidth: 620, paddingTop: 48, minHeight: "40vh" }}>
      <div className="modal-backdrop" style={{ position: "fixed" }}>
        <div
          className="modal-panel"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="retry-title"
          onKeyDown={(event) => {
            if (event.key === "Escape") setDismissed(true);
          }}
        >
          {body}
          <button type="button" className="linkish tiny" onClick={() => setDismissed(true)}>
            Hide this message
          </button>
        </div>
      </div>
    </div>
  );
}
