import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE } from "@campussphere/contracts";
import { clientIp, completeGoogleFlow, isAppError } from "@campussphere/core";
import { setSessionCookie } from "@/lib/session";
import { absoluteUrl, requestOrigin } from "@/lib/url";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const cookieState = store.get(OAUTH_STATE_COOKIE)?.value ?? null;
  const cookieVerifier = store.get(OAUTH_VERIFIER_COOKIE)?.value ?? null;

  const fail = (code: string) => {
    const target = absoluteUrl("/login", request);
    target.searchParams.set("error", code);
    return NextResponse.redirect(target);
  };

  if (!code || !state) return fail("oauth_denied");
  try {
    const { session, redirectTo } = await completeGoogleFlow({
      code,
      state,
      cookieState,
      cookieVerifier,
      userAgent: request.headers.get("user-agent"),
      ip: clientIp(request),
      origin: requestOrigin(request),
    });
    await setSessionCookie(session);
    const response = NextResponse.redirect(
      absoluteUrl(redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/dashboard", request),
    );
    for (const name of [OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE]) {
      response.cookies.delete(name);
    }
    return response;
  } catch (error) {
    // Never echo the error text into the URL: a crafted link could otherwise
    // put arbitrary words in the notice. The detail stays in the log.
    if (!isAppError(error)) console.error("[auth] google callback failed", error);
    const code =
      isAppError(error) && /unverified/i.test(error.message) ? "oauth_unverified" : "oauth_failed";
    return fail(code);
  }
}
