import { NextResponse } from "next/server";
import { OAUTH_FLOW_TTL_SECONDS, OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE } from "@campussphere/contracts";
import { beginGoogleFlow, enforceRateLimit, isAppError } from "@campussphere/core";
import { handleApi } from "@campussphere/core";
import { absoluteUrl } from "@/lib/url";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, "/api/auth/google/start", async () => {
    await enforceRateLimit(request, "auth.google.start", 20, 300);
    const url = new URL(request.url);
    const next = url.searchParams.get("next") ?? "/dashboard";
    try {
      const flow = await beginGoogleFlow(next.startsWith("/") && !next.startsWith("//") ? next : "/");
      const secure = process.env.NODE_ENV === "production";
      const response = NextResponse.redirect(flow.url);
      response.cookies.set(OAUTH_STATE_COOKIE, flow.state, {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/",
        maxAge: OAUTH_FLOW_TTL_SECONDS,
      });
      response.cookies.set(OAUTH_VERIFIER_COOKIE, flow.verifier, {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/",
        maxAge: OAUTH_FLOW_TTL_SECONDS,
      });
      return response;
    } catch (error) {
      if (!isAppError(error)) console.error("[auth] google start failed", error);
      const message = isAppError(error)
        ? error.message
        : "Google sign-in is unavailable right now.";
      const target = absoluteUrl("/login", request);
      target.searchParams.set("error", message);
      return NextResponse.redirect(target);
    }
  });
}
