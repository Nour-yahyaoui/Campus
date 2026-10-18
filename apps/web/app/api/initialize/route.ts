import { NextResponse } from "next/server";
import {
  applyPendingMigrations,
  bootstrapSuperAdmin,
  getEnv,
  migrationStatus,
  siteUrl,
} from "@campussphere/core";
import { decideAccess, escapeHtml, readDatabaseState, type DatabaseState } from "@/lib/initialize";

export const dynamic = "force-dynamic";
// Schema creation on a sleeping database can take longer than a default route,
// but 60 s is the ceiling on Vercel's Hobby plan and seven migrations take
// seconds; a larger value would be rejected at deploy time.
export const maxDuration = 60;

interface Summary {
  ok: boolean;
  mode: "write" | "read-only" | "denied";
  message?: string;
  alreadyInitialized?: boolean;
  changed?: boolean;
  state?: Pick<DatabaseState, "schemaReady" | "superAdmins">;
  migrations?: { appliedNow: string[]; total: number; pending: string[]; source?: "filesystem" | "embedded" };
  admin?: { email: string; created: boolean } | null;
  adminError?: string | null;
  nextSteps?: string[];
  siteUrl?: string;
}

/**
 * One URL that turns a fresh, empty database into a working CampusSphere:
 *
 *   https://<your-app>/api/initialize?email=you@university.edu
 *
 * It applies every pending migration — the same ledger and checksums as
 * `npm run db:migrate`, so the two can never disagree — and, when `email` is
 * given, creates the first super-admin. It is idempotent: visiting it again
 * reports status and changes nothing.
 *
 * Safety: with `SETUP_TOKEN` set, every call must carry it. Without it, the
 * route may only modify a database that has no super-admin yet; afterwards it is
 * read-only. That keeps the minimum configuration at three variables without
 * leaving a permanent "become admin" endpoint exposed.
 */
async function handle(request: Request): Promise<Response> {
  const env = getEnv();
  const url = new URL(request.url);
  const providedToken = url.searchParams.get("token") ?? request.headers.get("x-setup-token");
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();

  const before = await readDatabaseState();
  const access = decideAccess({
    tokenConfigured: Boolean(env.SETUP_TOKEN),
    expectedToken: env.SETUP_TOKEN ?? "",
    providedToken,
    state: before,
  });

  if (access.mode === "denied") {
    return respond(request, access.status, {
      ok: false,
      mode: "denied",
      message: access.message,
    });
  }

  if (access.mode === "read-only") {
    return respond(request, 200, {
      ok: true,
      mode: "read-only",
      alreadyInitialized: true,
      changed: false,
      state: { schemaReady: before.schemaReady, superAdmins: before.superAdmins },
      message: "This database is already initialised. Nothing was changed.",
      nextSteps: ["Sign in at /login with the Google account you registered."],
      siteUrl: siteUrl(),
    });
  }

  // Write path: apply migrations first, because creating the admin needs the
  // users table.
  let appliedNow: string[] = [];
  let total = 0;
  try {
    const result = await applyPendingMigrations();
    appliedNow = result.applied;
    total = result.total;
  } catch (error) {
    // The real cause is logged; the response stays generic, because this route
    // is reachable without a session and must not narrate infrastructure state.
    console.error("[initialize] migrations failed", error);
    return respond(request, 500, {
      ok: false,
      mode: "write",
      message: "The database could not be prepared. Check DATABASE_URL and that the database is running, then retry.",
      changed: false,
      nextSteps: [
        "Check DATABASE_URL (it must include ?sslmode=require for Neon) and that the database is running.",
        "Retry this URL once the database responds.",
      ],
    });
  }

  let admin: { email: string; created: boolean } | null = null;
  let adminError: string | null = null;
  if (email) {
    try {
      const result = await bootstrapSuperAdmin(email);
      admin = { email, created: result.created };
    } catch (error) {
      adminError = error instanceof Error ? error.message : String(error);
    }
  }

  const after = await readDatabaseState().catch(() => before);
  const status = await migrationStatus().catch(() => null);

  return respond(request, 200, {
    ok: Boolean(appliedNow.length) || Boolean(admin) || after.superAdmins > 0,
    mode: "write",
    changed: Boolean(appliedNow.length || admin),
    state: { schemaReady: after.schemaReady, superAdmins: after.superAdmins },
    migrations: {
      appliedNow,
      total: status?.total ?? total,
      pending: status?.pending ?? [],
      source: status?.source,
    },
    admin,
    adminError,
    nextSteps: admin
      ? [`Open /login and sign in with Google as ${admin.email}.`]
      : after.superAdmins > 0
        ? ["Sign in at /login with your super-admin account."]
        : ["Add &email=you@university.edu to this URL and reload to create the first super-admin."],
    siteUrl: siteUrl(),
  });
}

function respond(request: Request, status: number, body: Summary): Response {
  const wantsHtml = (request.headers.get("accept") ?? "").includes("text/html");
  if (!wantsHtml) return NextResponse.json(body, { status });
  return new NextResponse(renderPage(status, body), {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * A deliberately tiny page, independent of the design system: it has to render
 * even when the schema, the theme and the session plumbing do not exist yet.
 */
function renderPage(status: number, body: Summary): string {
  const title =
    body.mode === "denied"
      ? "Setup is locked"
      : body.alreadyInitialized
        ? "Already initialised"
        : body.ok
          ? "Setup complete"
          : "Setup needs attention";

  const rows: string[] = [];
  if (body.state) {
    rows.push(`<li><strong>Schema</strong> — ${body.state.schemaReady ? "present" : "missing"}</li>`);
    rows.push(`<li><strong>Super-admins</strong> — ${body.state.superAdmins}</li>`);
  }
  if (body.migrations) {
    rows.push(
      `<li><strong>Migrations</strong> — ${body.migrations.appliedNow.length} applied now, ${body.migrations.total} in total${
        body.migrations.pending.length ? `, ${body.migrations.pending.length} pending` : ""
      }</li>`,
    );
  }
  if (body.admin) {
    rows.push(
      `<li><strong>Super-admin</strong> — ${escapeHtml(body.admin.email)} ${body.admin.created ? "created" : "granted"}</li>`,
    );
  }

  const steps = (body.nextSteps ?? []).map((step) => `<li>${escapeHtml(step)}</li>`).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CampusSphere setup</title>
<style>
  :root { color-scheme: light; }
  body { font: 16px/1.55 system-ui, sans-serif; background:#f6f2e9; color:#1b1d16; margin:0; padding:32px 20px; }
  main { max-width: 620px; margin: 0 auto; background:#fffdf8; border:1px solid #ddd6c7; border-radius:14px; padding:26px 26px 30px; }
  h1 { font-size:1.5rem; margin:0 0 6px; }
  .badge { display:inline-block; font-size:.8rem; padding:3px 9px; border-radius:999px; margin-bottom:14px; }
  .badge.ok { background:#e3ebe3; color:#17392a; }
  .badge.fail { background:#f8e1dc; color:#9c2f24; }
  ul { padding-left:20px; }
  code { background:#f1ece1; padding:1px 5px; border-radius:5px; }
  a { color:#24503c; }
  .err { background:#f8e1dc; color:#9c2f24; padding:10px 12px; border-radius:9px; }
</style></head>
<body><main>
  <span class="badge ${body.ok ? "ok" : "fail"}">${escapeHtml(title)}</span>
  <h1>CampusSphere</h1>
  <p>${escapeHtml(body.message ?? (body.ok ? "This deployment is ready." : "Something went wrong."))}</p>
  ${body.adminError ? `<p class="err">${escapeHtml(body.adminError)}</p>` : ""}
  ${rows.length ? `<ul>${rows.join("")}</ul>` : ""}
  ${steps ? `<p><strong>Next</strong></p><ul>${steps}</ul>` : ""}
  <p style="color:#73786a;font-size:.85rem;margin-bottom:0">HTTP ${status}. Safe to bookmark: once setup is done this page only reports status.</p>
</main></body></html>`;
}

export async function GET(request: Request): Promise<Response> {
  return handle(request).catch((error: unknown) => {
    console.error("[initialize] failed", error);
    return NextResponse.json(
      { ok: false, mode: "denied", message: "The database is not reachable. Check DATABASE_URL." },
      { status: 503 },
    );
  });
}

/** Same behaviour for scripts: `curl -X POST 'https://app/api/initialize?email=…'`. */
export async function POST(request: Request): Promise<Response> {
  return GET(request);
}
