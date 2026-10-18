import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, storageOrigins } from "./lib/csp";

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
  const csp = buildCsp({
    nonce,
    isDev,
    // Uploads go browser -> storage with a presigned PUT. Without these the
    // browser blocks the request and every image upload fails on a host where
    // the app and the bucket are different origins.
    connectOrigins: storageOrigins({
      AWS_ENDPOINT_URL_S3: process.env.AWS_ENDPOINT_URL_S3,
      S3_ENDPOINT: process.env.S3_ENDPOINT,
      STORAGE_PUBLIC_BASE_URL: process.env.STORAGE_PUBLIC_BASE_URL,
    }),
  });

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
