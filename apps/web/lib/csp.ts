/**
 * The Content-Security-Policy lives in `proxy.ts` so it can carry a per-request
 * nonce; the string building lives here so it can be unit tested.
 *
 * Why `connect-src` is not simply `'self'`: uploads go straight from the
 * browser to object storage with a presigned PUT. That request is cross-origin
 * (Neon Object Storage, or any S3-compatible endpoint), so a strict `'self'`
 * silently blocks every image upload while the page itself still works. The
 * storage origin is therefore allowed explicitly — never a wildcard.
 */

/** Turns an endpoint into an origin, ignoring anything unparseable. */
export function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Explicit, statically-read env values — the middleware runs on the edge
 * runtime, where `process.env[key]` is not available, only build-time-inlined
 * `process.env.KEY` reads.
 */
export function storageOrigins(source: Record<string, string | undefined>): string[] {
  const origins = new Set<string>();
  for (const value of [source.AWS_ENDPOINT_URL_S3, source.S3_ENDPOINT, source.STORAGE_PUBLIC_BASE_URL]) {
    const origin = originOf(value);
    if (origin) origins.add(origin);
  }
  return [...origins];
}

export interface CspOptions {
  nonce: string;
  isDev: boolean;
  /** Extra origins allowed for `connect-src` (presigned uploads). */
  connectOrigins?: string[];
}

export function buildCsp({ nonce, isDev, connectOrigins = [] }: CspOptions): string {
  const connect = ["'self'", ...connectOrigins].join(" ");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
