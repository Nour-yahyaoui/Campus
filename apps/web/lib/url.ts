/**
 * Absolute URLs for redirects that leave the app (Google) or return to it from
 * a route handler.
 *
 * `request.url` is not trustworthy for this: `next start --hostname 0.0.0.0`
 * builds it from the bound address, so a redirect can point at 0.0.0.0 instead
 * of the public host. In production the canonical site URL wins; in
 * development/preview the forwarded host (set by the preview proxy) or the
 * request host is used so the preview origin is preserved.
 */
export function absoluteUrl(path: string, request: Request): URL {
  const safePath = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.NODE_ENV === "production" && configured) {
    return new URL(safePath, configured);
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto =
    request.headers.get("x-forwarded-proto") ??
    new URL(request.url).protocol.replace(":", "") ??
    "http";
  if (host && !host.startsWith("0.0.0.0")) {
    return new URL(safePath, `${proto}://${host}`);
  }
  if (configured) return new URL(safePath, configured);
  return new URL(safePath, request.url);
}
