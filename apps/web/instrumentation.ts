/**
 * Runs once when a Next.js server instance starts (not during `next build`).
 *
 * Configuration is validated here so a misconfigured deployment fails at boot
 * with one clear message instead of serving a 500 for every request that
 * happens to touch the environment. `getEnv()` caches the result.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getEnv } = await import("@campussphere/core");
  try {
    const env = getEnv();
    if (env.isProduction && !env.googleConfigured) {
      throw new Error(
        "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required to serve the web app in production: " +
          "development sign-in is disabled there, so without them nobody can sign in.",
      );
    }
  } catch (error) {
    // Log, do not throw: Next.js catches a throwing instrumentation hook and
    // leaves the process half-initialised, so even `/api/health/ready` stops
    // answering. A loud log plus a failing readiness probe is more useful, and
    // `/api/health/ready` names the offending dependency.
    console.error("[startup] invalid configuration:");
    console.error(error instanceof Error ? error.message : error);
  }
}
