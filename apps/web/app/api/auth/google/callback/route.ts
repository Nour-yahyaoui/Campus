import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE } from "@campussphere/contracts";
import { completeGoogleFlow, isAppError } from "@campussphere/core";
import { setSessionCookie } from "@/lib/session";
import { absoluteUrl } from "@/lib/url";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const cookieState = store.get(OAUTH_STATE_COOKIE)?.value ?? null;
  const cookieVerifier = store.get(OAUTH_VERIFIER_COOKIE)?.value ?? null;

  const fail = (message: string) => {
    const target = absoluteUrl("/login", request);
    target.searchParams.set("error", message);
    return NextResponse.redirect(target);
  };

  if (!code || !state) return fail("Google did not complete the sign-in. Try again.");
  try {
    const { session, redirectTo } = await completeGoogleFlow({
      code,
      state,
      cookieState,
      cookieVerifier,
      userAgent: request.headers.get("user-agent"),
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
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
    // Only our own user-facing errors are safe to echo back. Provider or
    // database failures get a generic message; the detail stays in the log.
    const message = isAppError(error)
      ? error.message
      : "Google sign-in could not be completed. Try again in a moment.";
    if (!isAppError(error)) console.error("[auth] google callback failed", error);
    return fail(message);
  }
}
