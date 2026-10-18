import Link from "next/link";
import type { Metadata } from "next";
import { PRODUCT } from "@campussphere/contracts";
import { siteStats } from "@campussphere/core";
import { StatStrip } from "@/components/Pieces";
import { numeric } from "@/lib/format";

export const metadata: Metadata = {
  title: "About, status and principles",
  description:
    "What CampusSphere is, what is verified in this build, how privacy and accessibility are handled, and what is deliberately not claimed.",
  alternates: { canonical: "/about" },
};


const verified = [
  "Club mini-sites, join requests, officer review, role handover and announcements",
  "Project proposals with a super-admin review queue, role applications and a workspace",
  "Event proposals, approval, publishing, capacity-safe registration, waitlist promotion and cancellations",
  "Single-use, time-limited QR check-in with a database-enforced audit trail",
  "Google OIDC with PKCE, state and nonce verification, plus opaque HttpOnly sessions",
  "Append-only audit log enforced by a database trigger",
  "Honest System Observatory backed by real queries and process metrics",
  "Database migrations and invariants verified by automated integration tests",
];

const notVerified = [
  "No university has formally endorsed or adopted this deployment; it is a pilot build.",
  "Google sign-in cannot be exercised in this environment because no OAuth client is configured.",
  "Email is logged, not delivered, unless SMTP or Resend credentials are supplied by the operator.",
  "The Rust + Actix Web API and the standalone fallback API exist as source and contract work; the running preview serves the Next.js app with the shared service layer.",
  "The 3,000-concurrent-user target has not been measured here; a load-test plan is documented instead of a claim.",
  "The project has not undergone an independent security audit.",
];

// Reads live aggregate counts; never prerender a stale or empty status page.
export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const stats = await siteStats();

  return (
    <div className="shell" style={{ maxWidth: 880 }}>
      <div className="page-head">
        <p className="eyebrow">Open source, honestly described</p>
        <h1>About CampusSphere</h1>
        <p className="lede">
          A free university community platform built so students can find clubs, projects and events — and
          so maintainers can keep it running without a paid SaaS plan.
        </p>
      </div>

      <StatStrip
        items={[
          { label: "Clubs", value: numeric(stats.clubs) },
          { label: "Projects", value: numeric(stats.projects) },
          { label: "Events", value: numeric(stats.events) },
          { label: "Checked-in attendees", value: numeric(stats.confirmedAttendance) },
        ]}
      />

      <section className="section">
        <h2>What it is</h2>
        <p className="prose">
          CampusSphere is an MIT-licensed project by {PRODUCT.creator}. Guests can browse public club
          pages, approved projects and published events without an account. Signing in with Google adds a
          persistent identity for applications, registrations, posts and roles. Guest aliases stored in a
          browser are convenience only — they are never authentication.
        </p>
        <p className="prose">
          The platform is built as a modular monolith: a Next.js App Router frontend for rendering and SEO,
          a shared domain/service layer validated against PostgreSQL, a Rust + Actix Web API targeted as the
          primary backend, and a separate API-only Next.js fallback with its own health checks. All of them
          are designed around the same schema and transaction rules.
        </p>
      </section>

      <section className="section" id="status">
        <h2>Status of this build</h2>
        <div className="grid-2">
          <div className="card">
            <h3 style={{ fontSize: "1.1rem", color: "var(--accent-ink)" }}>Implemented and verified</h3>
            <ul className="small" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
              {verified.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className="card">
            <h3 style={{ fontSize: "1.1rem", color: "var(--marigold)" }}>Not claimed / not verified</h3>
            <ul className="small" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
              {notVerified.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className="section" id="privacy">
        <h2>Privacy</h2>
        <p className="prose">
          We store the minimum needed to run the community: your name, email, optional avatar and bio,
          memberships, applications and registrations. Sessions are opaque random tokens stored only as
          SHA-256 hashes; they live in HttpOnly, SameSite cookies and are never placed in localStorage.
          Rate-limit counters store a hashed IP identity, not the address itself. Audit records are
          append-only and contain no passwords or tokens.
        </p>
        <p className="prose">
          You can export your data as JSON from your profile and request deletion at any time. Deletion
          anonymises the account immediately and revokes every session; club and project history keeps the
          contribution without your name so other members are not left with broken threads.
        </p>
      </section>

      <section className="section" id="accessibility">
        <h2>Accessibility</h2>
        <p className="prose">
          The interface is designed mobile-first and tested down to 320 CSS pixels, with visible focus
          states, labelled forms, semantic headings, 44px touch targets on primary actions and support for
          reduced motion. Admin tables switch to cards or labelled horizontal scrolling on small screens.
          If you hit a barrier, the repository issue tracker is the honest place to report it.
        </p>
      </section>

      <section className="section" id="security">
        <h2>Security</h2>
        <p className="prose">
          Authorization is enforced in the service layer, not by hiding buttons: club officers can only act
          on their own club, project leads on their own project, and organizers on their own event.
          Every mutation is validated with explicit schemas, rate-limited where it matters, and audited.
          Sessions rotate on privilege changes, and the database rejects updates or deletes on the audit
          table.
        </p>
        <p className="prose">
          Security is a release requirement, not a claim of perfection. Please report vulnerabilities
          privately through the repository&apos;s security policy rather than in public issues.
        </p>
      </section>

      <section className="section">
        <h2>The honest limits of a pilot</h2>
        <p className="prose">
          Free tiers impose cold starts, connection limits and quotas; hosting is not unlimited and this
          project explains costs rather than promising zero. No metric on this site is seeded to look
          impressive, and no testimonial, affiliation or usage number is fabricated. Where a capability is
          missing — Google credentials in this preview, a running Rust process, a delivered email — the
          interface says so.
        </p>
        <div className="row mt-2">
          <a className="btn btn-primary" href={PRODUCT.repository} rel="noreferrer noopener" target="_blank">
            Read the source
          </a>
          <Link className="btn btn-secondary" href="/observatory">System Observatory</Link>
        </div>
        <p className="tiny muted mt-2">
          Maintained by {PRODUCT.creator}. Contact details are kept in the repository profile, not
          scattered across application pages.
        </p>
      </section>
    </div>
  );
}
