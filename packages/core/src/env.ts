import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * The repository keeps exactly one `.env` at its root. Next.js only looks in
 * the app directory, and worker/CLI processes are started from wherever the
 * operator happens to be, so configuration is hydrated here once — before the
 * schema is parsed — by walking up from the working directory. Values already
 * present in the real environment always win, which is what deployments need.
 */
let envFileLoaded = false;

export function loadRepoEnvFile(): string | null {
  if (envFileLoaded) return null;
  envFileLoaded = true;
  let dir = process.cwd();
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) {
      try {
        process.loadEnvFile(candidate);
        return candidate;
      } catch {
        return null;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}


/**
 * Configuration is validated once at startup and fails fast with a readable
 * message. Secrets live only in the server environment; nothing here is
 * prefixed with NEXT_PUBLIC_ except values that are genuinely public.
 */
const booleanish = z
  .string()
  .optional()
  .transform((value) => value === "true" || value === "1");

/**
 * A dashboard field left blank arrives as `""`, which is not the same as unset:
 * `"" ?? fallback` keeps the empty string, and an empty canonical host would
 * put `https:///clubs` in every `<link rel="canonical">`. Blank means "not
 * configured" everywhere in this file.
 */
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(blankToUndefined, z.string().optional());
const optionalUrl = z.preprocess(blankToUndefined, z.string().url().optional());
const optionalInteger = z.preprocess(blankToUndefined, z.coerce.number().int().optional());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.string().optional(),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  NEXT_PUBLIC_SITE_URL: optionalUrl,
  API_BASE_URL: optionalUrl,

  // Operations dashboard. `API_BASE_URL` is the Actix service the dashboard
  // probes; `METRICS_TOKEN` is optional and, when set on both services, keeps
  // the detailed metrics endpoint from being readable by anyone else.
  METRICS_TOKEN: optionalString,
  // Only used when the platform does not report a memory limit itself (Vercel
  // and Docker both do). It is a budget for the percentage, not a quota.
  SERVER_MEMORY_LIMIT_MB: optionalInteger,

  // How many proxies in front of the app are trusted to have appended to
  // `x-forwarded-for`. One (the default) is right for Vercel and Render: the
  // last entry is the address the proxy saw, everything before it is
  // client-supplied and therefore spoofable.
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).max(10).default(1),
  // Key for HMAC-ing IP addresses before storage. Optional so local
  // development needs no configuration; production should set it.
  IP_HASH_SECRET: optionalString,

  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  ALLOW_DEV_SIGN_IN: booleanish,

  EMAIL_TRANSPORT: z.enum(["console", "smtp", "resend"]).default("console"),
  EMAIL_FROM: z.string().default("CampusSphere <no-reply@campussphere.local>"),
  SMTP_URL: optionalString,
  RESEND_API_KEY: optionalString,

  METRICS_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  JOBS_POLL_INTERVAL_MS: z.coerce.number().int().min(200).max(60_000).default(2_000),
  JOBS_WORKER_ENABLED: booleanish,
  RATE_LIMIT_DISABLED: booleanish,

  // Optional. When set, `/api/initialize` requires it; when unset, that route
  // may only set up a database that has no super-admin yet. An empty value in
  // .env means "not set", like every other optional string here.
  SETUP_TOKEN: z.preprocess(blankToUndefined, z.string().min(8).optional()),

  // The zero-touch alternative to SETUP_TOKEN: the first *verified* Google
  // sign-in with exactly this address is granted super_admin once, and the
  // setting is then inert. It removes the first-run window in which anyone who
  // finds `/api/initialize` could create themselves an admin account.
  INITIAL_ADMIN_EMAIL: z.preprocess(blankToUndefined, z.string().email().optional()),

  // Optional, comma-separated origins whose `/api/auth/google/callback` is a
  // registered redirect URI on the Google client. Vercel aliases are allowed
  // without listing; anything else (a second domain, a staging host) goes here.
  AUTH_ALLOWED_ORIGINS: z.preprocess(blankToUndefined, z.string().optional()),
});

export type Env = Omit<z.infer<typeof schema>, "NEXT_PUBLIC_SITE_URL" | "APP_ENV"> & {
  /** Always present: falls back to the hosting provider's URL, then localhost. */
  NEXT_PUBLIC_SITE_URL: string;
  /** Always present: defaults to NODE_ENV, so production never reads "development". */
  APP_ENV: string;
  isProduction: boolean;
  isTest: boolean;
  googleConfigured: boolean;
  devSignInEnabled: boolean;
};

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (source === process.env && !source.DATABASE_URL) loadRepoEnvFile();
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid server configuration:\n${issues}`);
  }
  const value = parsed.data;
  const isProduction = value.NODE_ENV === "production";
  const googleConfigured = Boolean(value.GOOGLE_CLIENT_ID && value.GOOGLE_CLIENT_SECRET);

  // Guard rails: never allow insecure convenience features to ship silently.
  if (isProduction && value.ALLOW_DEV_SIGN_IN) {
    throw new Error("ALLOW_DEV_SIGN_IN must be false in production.");
  }
  // Google credentials are only required by the web app; the read-only
  // fallback and the worker share this module but never start an OAuth flow.
  // `apps/web/instrumentation.ts` enforces them for the web service.
  if (isProduction && value.EMAIL_TRANSPORT === "console") {
    // Not fatal: email is optional for the pilot, but the failure is visible.
    console.warn("[config] EMAIL_TRANSPORT=console in production; email delivery is logged only.");
  }

  const resolvedSiteUrl = value.NEXT_PUBLIC_SITE_URL ?? derivedSiteUrl() ?? "http://localhost:3000";

  return {
    ...value,
    NEXT_PUBLIC_SITE_URL: resolvedSiteUrl,
    // An unset APP_ENV used to fall back to "development" even on a production
    // deployment, which made the dashboard footer read "env development".
    APP_ENV: value.APP_ENV ?? (isProduction ? "production" : "development"),
    isProduction,
    isTest: value.NODE_ENV === "test",
    googleConfigured,
    // Dev sign-in exists for local/preview use and is impossible in production.
    devSignInEnabled: !isProduction && value.ALLOW_DEV_SIGN_IN,
  };
}

/**
 * The public origin, without requiring a variable that the host already knows.
 * Render sets `RENDER_EXTERNAL_URL`; Vercel sets `VERCEL_PROJECT_PRODUCTION_URL`
 * (production) and `VERCEL_URL` (each deployment). OAuth redirect URIs and
 * cookies depend on this matching reality, so a custom domain still needs
 * NEXT_PUBLIC_SITE_URL — a preview URL must not become the canonical one.
 */
function derivedSiteUrl(): string | null {
  const candidates = [
    process.env.RENDER_EXTERNAL_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return new URL(candidate).origin;
    } catch {
      /* ignore a malformed host-provided value */
    }
  }
  return null;
}

export function getEnv(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}

/** Test-only hook so suites can pin configuration per process. */
export function resetEnvCache(): void {
  cached = null;
}

/**
 * The canonical public origin, without validation.
 *
 * Metadata (`layout.tsx`, `sitemap.ts`, `robots.ts`) is evaluated during
 * `next build`, where `NODE_ENV` is already `production` — calling `getEnv()`
 * there would turn an unrelated configuration mistake (for example a stray
 * `ALLOW_DEV_SIGN_IN=true` in a developer's `.env`) into a build failure.
 * Configuration errors belong at runtime, where readiness reports them.
 */
export function siteUrl(): string {
  try {
    return getEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  } catch {
    // Invalid configuration must not silently produce an empty canonical host.
    const explicit = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
    return (explicit || derivedSiteUrl() || "http://localhost:3000").replace(/\/$/, "");
  }
}
