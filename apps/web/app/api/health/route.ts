import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness: process is up. Never depends on an external provider. */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
    uptimeSeconds: Math.round(process.uptime()),
  });
}
