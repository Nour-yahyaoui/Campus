import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@campussphere/contracts";
import { revokeSession } from "@campussphere/core";
import { absoluteUrl } from "@/lib/url";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
