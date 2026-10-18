import { jsonResponse } from "@campussphere/core";
import { withRead } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Liveness never checks external providers. */
export function GET(request: Request) {
  return withRead(request, "/health/live", async () =>
    jsonResponse({
      status: "ok",
      service: "campussphere-fallback-api",
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
      uptimeSeconds: Math.round(process.uptime()),
    }),
  );
}
