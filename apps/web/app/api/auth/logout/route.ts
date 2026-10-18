import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@campussphere/contracts";
import { assertSameOrigin, isAppError, revokeSession } from "@campussphere/core";
import { absoluteUrl } from "@/lib/url";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Signing someone out is a state change, so it gets the same origin check as
  // other cookie-authenticated mutations; otherwise any page can log a visitor
  // out by posting to this URL.
  try {
    assertSameOrigin(request);
  } catch (error) {
    const status = isAppError(error) ? error.status : 403;
    return NextResponse.json(
      { error: { code: "forbidden", message: "Cross-origin request blocked." } },
      { status },
    );
  }
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (match) {
    await revokeSession(decodeURIComponent(match.slice(SESSION_COOKIE.length + 1))).catch(() => {});
  }
  const response = NextResponse.redirect(absoluteUrl("/", request), { status: 303 });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" });
  return response;
}

export async function GET() {
  return NextResponse.json({ error: { code: "invalid_request", message: "Use POST to sign out." } }, { status: 405 });
}
