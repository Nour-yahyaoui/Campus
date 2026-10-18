import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/config";
import { currentUser, safeNext } from "@/lib/session";
import { devSignInAction } from "@/app/actions/auth";
import { Notice } from "@/components/Pieces";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to apply to clubs, join projects, register for events and post as yourself.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const me = await currentUser();
  const next = safeNext(params.next);
  if (me) redirect(next);
  const options = authOptions();

  return (
    <div className="shell" style={{ maxWidth: 560, paddingTop: 48 }}>
      <p className="eyebrow">Your account</p>
      <h1 style={{ fontSize: "clamp(2rem, 6vw, 2.8rem)" }}>Sign in to take part</h1>
      <p className="lede">
        Browsing is always open. Signing in lets you apply to clubs, join project teams, register for
        events and post under your own name.
      </p>

      {params.error ? <Notice tone="danger">{params.error}</Notice> : null}

      <div className="card mt-2">
        <h2 style={{ fontSize: "1.25rem" }}>Continue with Google</h2>
        <p className="small muted">
          We receive your name, email and profile picture from Google. We never post on your behalf.
          Google sign-in does not prove university enrollment.
        </p>
        {options.google ? (
          <Link className="btn btn-primary btn-block" href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}>
            Continue with Google
          </Link>
        ) : (
          <div className="callout">
            <strong>Google sign-in is not configured on this deployment.</strong>
            <p className="small" style={{ margin: "6px 0 0" }}>
              The operator must set <span className="mono">GOOGLE_CLIENT_ID</span> and{" "}
              <span className="mono">GOOGLE_CLIENT_SECRET</span> (and register the callback URL with
              Google). Nothing is faked in its place.
            </p>
          </div>
        )}
      </div>

      {options.dev ? (
        <div className="card mt-2">
          <div className="spread">
            <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Development sign-in</h2>
            <span className="tag tag-marigold">Local only</span>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            This shortcut exists because this deployment has no Google credentials. It signs you in with
            an email without verifying it, and it is refused in production.
          </p>
          <form action={devSignInAction}>
            <input type="hidden" name="next" value={next} />
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                className="input"
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@university.edu"
              />
            </div>
            <div className="field">
              <label htmlFor="name">Display name <span className="hint">(optional)</span></label>
              <input className="input" id="name" name="name" autoComplete="name" maxLength={120} />
            </div>
            <SubmitButton className="btn btn-secondary btn-block">Continue in development mode</SubmitButton>
          </form>
          <p className="tiny muted" style={{ marginTop: 10 }}>
            Seeded demo accounts (if you ran <span className="mono">npm run db:seed</span>):{" "}
            <span className="mono">student@campussphere.local</span>,{" "}
            <span className="mono">lead@campussphere.local</span>,{" "}
            <span className="mono">officer@campussphere.local</span>,{" "}
            <span className="mono">admin@campussphere.local</span>.
          </p>
        </div>
      ) : null}

      <p className="small muted mt-3">
        By continuing you agree to the project&apos;s acceptable-use expectations in{" "}
        <Link href="/about#privacy">the about page</Link>. You can export or delete your account from
        your profile at any time.
      </p>
    </div>
  );
}
