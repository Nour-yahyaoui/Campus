import { NextResponse } from "next/server";
import {
  applyPendingMigrations,
  bootstrapSuperAdmin,
  getEnv,
  migrationStatus,
  seedDemoData,
  siteUrl,
  writeAudit,
  type DemoSeedResult,
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
  demo?: DemoSeedResult | { error: string } | null;
  nextSteps?: string[];
  siteUrl?: string;
  /** GET never writes; this says whether a POST would be accepted. */
  canWrite?: boolean;
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
  // Header first: query strings end up in proxy logs, browser history and
  // Referer headers. `?token=` stays supported because it is what the setup
  // page and the deployment docs use, but a header never leaks by accident.
  const providedToken = request.headers.get("x-setup-token") ?? url.searchParams.get("token");
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  const demoParam = url.searchParams.get("demo");
  const isWrite = request.method === "POST" || request.method === "PUT";

  const before = await readDatabaseState();
  const access = decideAccess({
    tokenConfigured: Boolean(env.SETUP_TOKEN),
    expectedToken: env.SETUP_TOKEN ?? "",
    providedToken,
    state: before,
    isProduction: env.isProduction,
    initialAdminConfigured: Boolean(env.INITIAL_ADMIN_EMAIL),
  });

  if (access.mode === "denied") {
    await auditAttempt("setup.denied", {
      reason: access.status === 401 ? "bad-token" : "locked",
      attemptedEmail: email || null,
    });
    return respond(request, access.status, {
      ok: false,
      mode: "denied",
      message: access.message,
      state: { schemaReady: before.schemaReady, superAdmins: before.superAdmins },
      siteUrl: siteUrl(),
    });
  }

  // A GET is a status report and never mutates. Crawlers, chat link previews
  // and security scanners all issue GETs; the previous version applied
  // migrations and created the first super-admin for whoever asked first.
  if (!isWrite) {
    return respond(request, 200, {
      ok: true,
      mode: "read-only",
      alreadyInitialized: before.superAdmins > 0,
      changed: false,
      state: { schemaReady: before.schemaReady, superAdmins: before.superAdmins },
      message:
        access.mode === "read-only"
          ? "This database is already initialised. Nothing was changed."
          : "This page only reports status. Submit the form below to apply setup.",
      canWrite: access.mode === "write",
      nextSteps:
        access.mode === "write"
          ? [
              "Submit the form below (a POST) to apply migrations" +
                (access.allowAdmin && email ? " and create the first super-admin." : "."),
            ]
          : ["Sign in at /login with your super-admin account."],
      siteUrl: siteUrl(),
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

  // `?demo=light` fills a first-run database with a small, realistic catalogue
  // so a deployment can be looked at without a shell. It is opt-in, one-shot and
  // unavailable once a catalogue exists (see `seedDemoData`).
  const demoChoice = demoParam?.trim().toLowerCase() ?? "";
  const prefersNoDemo = ["", "0", "false", "no"].includes(demoChoice);
  const prefersDemo = ["light", "1", "true", "yes", "demo", "full"].includes(demoChoice);
  if (!prefersNoDemo && !prefersDemo) {
    return respond(request, 400, {
      ok: false,
      mode: "write",
      message: `Unknown demo selection "${demoParam}". Use ?demo=light, or leave the parameter out.`,
      nextSteps: ["Remove the demo parameter to set up an empty database."],
    });
  }
  if (prefersDemo && !access.allowDemo) {
    return respond(request, 403, {
      ok: false,
      mode: "denied",
      message:
        "Demo content cannot be seeded on this deployment. Set SETUP_TOKEN and call this URL with it.",
      siteUrl: siteUrl(),
    });
  }
  if (email && !access.allowAdmin) {
    return respond(request, 403, {
      ok: false,
      mode: "denied",
      message:
        "This deployment creates its first super-admin through INITIAL_ADMIN_EMAIL, not through this URL. " +
        "Sign in with that Google account instead.",
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

  let demo: Summary["demo"] = null;
  if (prefersDemo) {
    try {
      demo = await seedDemoData();
    } catch (error) {
      console.error("[initialize] demo seed failed", error);
      demo = {
        error:
          "The demo catalogue could not be inserted, so nothing was changed. This is usually a database timeout — retry in a few seconds.",
      };
    }
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
  const demoSeeded = Boolean(demo && "seeded" in demo && demo.seeded);

  await auditAttempt("setup.completed", {
    migrations: appliedNow.length,
    admin: admin?.email ?? null,
    demo: demoSeeded,
  });

  return respond(request, 200, {
    ok: Boolean(appliedNow.length) || Boolean(admin) || after.superAdmins > 0 || demoSeeded,
    mode: "write",
    changed: Boolean(appliedNow.length || admin || demoSeeded),
    state: { schemaReady: after.schemaReady, superAdmins: after.superAdmins },
    migrations: {
      appliedNow,
      total: status?.total ?? total,
      pending: status?.pending ?? [],
      source: status?.source,
    },
    admin,
    adminError,
    demo,
    nextSteps: admin
      ? [`Open /login and sign in with Google as ${admin.email}.`]
      : after.superAdmins > 0
        ? ["Sign in at /login with your super-admin account."]
        : [
            "Add &email=you@university.edu to this URL and submit it again to create the first super-admin.",
            ...(demoSeeded
              ? ["Browse /clubs and /events — the demo catalogue is live and the first-run window stays open until you re-run this URL with your email."]
              : []),
          ],
    siteUrl: siteUrl(),
  });
}

/**
 * Best-effort audit for setup attempts. It must never break setup itself: the
 * schema (and therefore `audit_events`) may not exist yet on the very first run.
 */
async function auditAttempt(action: string, metadata: Record<string, unknown>): Promise<void> {
  try {
    await writeAudit({
      actorId: null,
      action,
      entityType: "system",
      entityId: "setup",
      metadata,
    });
  } catch {
    /* no schema yet, or the database is down — the response still stands */
  }
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
  if (body.demo) {
    if ("error" in body.demo) rows.push(`<li class="err">${escapeHtml(body.demo.error)}</li>`);
    else if (body.demo.seeded)
      rows.push(
        `<li><strong>Demo catalogue</strong> — ${body.demo.counts.clubs} clubs, ${body.demo.counts.events} events, ${body.demo.counts.projects} projects, ${body.demo.counts.users} people</li>`,
      );
    else
      rows.push(
        `<li><strong>Demo catalogue</strong> — skipped: ${
          body.demo.reason === "already-seeded" ? "already present" : "this database already has a catalogue"
        }</li>`,
      );
  }

  const steps = (body.nextSteps ?? []).map((step) => `<li>${escapeHtml(step)}</li>`).join("");
  // An empty `action` posts to the current URL *including* its query string,
  // so the operator can keep their email/token in the address bar and press the
  // button — without the secret being copied into the HTML.
  const form = body.canWrite
    ? `<form method="post"><button type="submit">Run setup</button></form>`
    : "";

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
  form { margin: 18px 0 6px; }
  button { font: inherit; background:#24503c; color:#fff; border:0; border-radius:9px; padding:10px 16px; cursor:pointer; }
  button:hover { background:#17392a; }
</style></head>
<body><main>
  <span class="badge ${body.ok ? "ok" : "fail"}">${escapeHtml(title)}</span>
  <h1>CampusSphere</h1>
  <p>${escapeHtml(body.message ?? (body.ok ? "This deployment is ready." : "Something went wrong."))}</p>
  ${body.adminError ? `<p class="err">${escapeHtml(body.adminError)}</p>` : ""}
  ${rows.length ? `<ul>${rows.join("")}</ul>` : ""}
  ${form}
  ${steps ? `<p><strong>Next</strong></p><ul>${steps}</ul>` : ""}
  <p style="color:#73786a;font-size:.85rem;margin-bottom:0">HTTP ${status}. This page only reports status until you submit the form; once setup is done it stays read-only.</p>
</main></body></html>`;
}

function failure(error: unknown): Response {
  console.error("[initialize] failed", error);
  return NextResponse.json(
    { ok: false, mode: "denied", message: "The database is not reachable. Check DATABASE_URL." },
    { status: 503 },
  );
}

/** Status only. Safe to link, bookmark and preview: it never writes. */
export async function GET(request: Request): Promise<Response> {
  return handle(request).catch(failure);
}

/** Applies setup. `curl -X POST 'https://app/api/initialize?email=…'`. */
export async function POST(request: Request): Promise<Response> {
  return handle(request).catch(failure);
}
