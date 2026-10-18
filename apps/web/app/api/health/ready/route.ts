import { NextResponse } from "next/server";
import { getEnv, query, storageInfo } from "@campussphere/core";

export const dynamic = "force-dynamic";

/** Readiness: only critical dependencies, with a bounded timeout. */
export async function GET() {
  const started = Date.now();
  const checks: Record<string, { ok: boolean; latencyMs?: number; detail?: string }> = {};
  try {
    await Promise.race([
      query("select 1"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3_000)),
    ]);
    checks.database = { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    checks.database = { ok: false, detail: error instanceof Error ? error.message : "unavailable" };
  }
  // Configuration is a dependency too: a container that starts with the
  // development sign-in flag, or without Google credentials, cannot serve a
  // usable sign-in flow. Reporting it here makes the platform health check
  // fail and roll the deploy back.
  try {
    const env = getEnv();
    checks.config = {
      ok: !env.isProduction || env.googleConfigured,
      ...(env.isProduction && !env.googleConfigured
        ? { detail: "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET missing in production" }
        : {}),
    };
  } catch (error) {
    checks.config = { ok: false, detail: error instanceof Error ? error.message : "invalid configuration" };
  }

  const ok = Object.values(checks).every((check) => check.ok);
  // Storage is reported but does not gate readiness: a site without images is
  // still usable, whereas a container that cannot reach Postgres is not.
  const storage = storageInfo();
  return NextResponse.json(
    {
      status: ok ? "ok" : "unavailable",
      checks,
      storage: { driver: storage.driver, bucket: storage.bucket, configured: storage.configured },
    },
    { status: ok ? 200 : 503 },
  );
}
