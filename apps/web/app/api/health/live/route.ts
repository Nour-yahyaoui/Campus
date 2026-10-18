import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness probe. Kept alongside `/api/health` for hosts that expect a
 * `/live` suffix to pair with `/ready`; both are process-only checks and never
 * fail because a provider is down.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "campussphere-web",
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
    uptimeSeconds: Math.round(process.uptime()),
  });
}
