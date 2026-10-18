"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

type Kind = "avatar" | "club_logo" | "club_cover" | "project_cover" | "event_cover";

interface Props {
  kind: Kind;
  scopeId?: string | null;
  currentUrl?: string | null;
  label: string;
  hint?: string;
  /** `avatar` renders a circle; everything else a wide 16:9 frame. */
  shape?: "avatar" | "wide";
  /** Server-provided fallback preview (e.g. a monogram) when no image exists. */
  fallback?: React.ReactNode;
}

/**
 * Uploads an image straight to object storage:
 *   1. ask the server to authorize the upload and presign a PUT,
 *   2. send the bytes to that URL (never through our own server in production),
 *   3. ask the server to verify and attach the result.
 * The preview switches immediately, but the saved URL only appears after
 * step 3 — a failed upload never leaves a broken image behind.
 */
export function ImageUploader({ kind, scopeId, currentUrl, label, hint, shape = "wide", fallback }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function upload(file: File) {
    setError(null);
    setMessage(null);
    if (!ACCEPTED.includes(file.type)) {
      setError("Choose a JPEG, PNG, WebP or AVIF image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Images must be smaller than 5 MB.");
      return;
    }

    const optimistic = URL.createObjectURL(file);
    const previous = preview;
    setPreview(optimistic);
    setBusy(true);
    try {
      const presignResponse = await fetch("/api/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, scopeId: scopeId ?? null, contentType: file.type, byteSize: file.size }),
      });
      const presign = (await presignResponse.json().catch(() => ({}))) as {
        mediaId?: string;
        upload?: { url: string; method: string; headers: Record<string, string> };
        error?: { message?: string };
      };
      if (!presignResponse.ok || !presign.mediaId || !presign.upload) {
        throw new Error(presign.error?.message ?? "The upload could not be started.");
      }

      const put = await fetch(presign.upload.url, {
        method: presign.upload.method,
        headers: presign.upload.headers,
        body: file,
      });
      if (!put.ok) throw new Error("The image did not reach storage. Try again.");

      const completeResponse = await fetch(`/api/uploads/${presign.mediaId}/complete`, { method: "POST" });
      const completed = (await completeResponse.json().catch(() => ({}))) as {
        url?: string;
        error?: { message?: string };
      };
      if (!completeResponse.ok || !completed.url) {
        throw new Error(completed.error?.message ?? "The image could not be verified.");
      }
      setPreview(completed.url);
      setMessage("Image saved.");
      router.refresh();
    } catch (cause) {
      setPreview(previous);
      setError(cause instanceof Error ? cause.message : "The upload failed.");
    } finally {
      URL.revokeObjectURL(optimistic);
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const mediaId = preview?.match(/^\/media\/([0-9a-f-]{36})$/i)?.[1] ?? null;

  async function remove() {
    if (!mediaId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/uploads/${mediaId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "The image could not be removed.");
      }
      setPreview(null);
      setMessage("Image removed.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The image could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="uploader">
      <div className={`uploader-frame${shape === "avatar" ? " uploader-avatar" : ""}`}>
        {preview ? (
          // The image URL is same-origin (`/media/…`) and already validated server-side.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" width={shape === "avatar" ? 96 : 480} height={shape === "avatar" ? 96 : 270} />
        ) : (
          <div className="uploader-placeholder">{fallback ?? <span className="small muted">No image yet</span>}</div>
        )}
        {busy ? <div className="uploader-busy" aria-hidden="true" /> : null}
      </div>

      <div className="uploader-controls">
        <span className="small" style={{ fontWeight: 600 }}>{label}</span>
        {hint ? <span className="tiny muted">{hint}</span> : null}
        <div className="row" style={{ gap: 8, marginTop: 6 }}>
          <label className="btn btn-secondary btn-sm" htmlFor={inputId} aria-disabled={busy}>
            {preview ? "Replace image" : "Choose image"}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            className="sr-only"
            type="file"
            accept={ACCEPTED.join(",")}
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
            aria-describedby={`${inputId}-status`}
          />
          {mediaId ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void remove()} disabled={busy}>
              Remove
            </button>
          ) : null}
          {busy ? <span className="small muted" role="status">Uploading…</span> : null}
        </div>
        <p id={`${inputId}-status`} className="tiny" role="status" aria-live="polite" style={{ margin: "6px 0 0" }}>
          {error ? <span style={{ color: "var(--danger)" }}>{error}</span> : message ?? "JPEG, PNG, WebP or AVIF · up to 5 MB."}
        </p>
      </div>
    </div>
  );
}
