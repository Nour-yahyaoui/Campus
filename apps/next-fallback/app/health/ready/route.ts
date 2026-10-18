import { jsonResponse, one } from "@campussphere/core";
import { withRead } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Readiness checks only the authoritative database, with a bounded timeout. */
export function GET(request: Request) {
  return withRead(request, "/health/ready", async () => {
    const started = Date.now();
    const checks: Record<string, { ok: boolean; latencyMs?: number; detail?: string }> = {};
    try {
      await Promise.race([
        one("select 1 as ok"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3_000)),
      ]);
      checks.database = { ok: true, latencyMs: Date.now() - started };
    } catch (error) {
      checks.database = {
        ok: false,
        detail: error instanceof Error ? error.message : "unavailable",
      };
    }
    const ok = Object.values(checks).every((check) => check.ok);
    return jsonResponse({ status: ok ? "ok" : "unavailable", checks }, ok ? 200 : 503);
  });
}
