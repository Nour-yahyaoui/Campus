import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 calls this file `proxy.ts`; it is the same request pipeline that
 * was previously named middleware.
 *
 * Content-Security-Policy with a per-request nonce. Next.js reads the nonce
 * from this header and stamps its own scripts with it. The policy keeps
 * 'unsafe-inline' for styles only (needed by React style attributes), and
 * allows no third-party script origins.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/admin", "/observatory"];

export default function proxy(request: NextRequest) {
  // Cheap cookie-presence gate. It is not authentication — the page and every
  // server action still validate the session server-side — but it returns a
  // real 307 for signed-out visitors instead of streaming a shell and then
  // redirecting in the browser.
  const { pathname, search } = request.nextUrl;
  const needsSession = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (needsSession && !request.cookies.get("cs_session")?.value) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    return NextResponse.redirect(loginUrl, 307);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
