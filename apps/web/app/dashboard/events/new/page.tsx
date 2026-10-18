import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { EVENT_CATEGORIES } from "@campussphere/contracts";
import { categoryLabel } from "@/lib/format";
import { clubsWhereOfficer } from "@campussphere/core";
import { currentUser } from "@/lib/session";
import { Notice } from "@/components/Pieces";
import { createEventAction } from "@/app/actions/events";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata: Metadata = { title: "Propose an event", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const TIMEZONES = ["Africa/Tunis", "Europe/Paris", "Europe/London", "UTC", "America/New_York", "Asia/Dubai"];

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const messages = await searchParams;
  const me = await currentUser();
  if (!me) redirect("/login?next=/dashboard/events/new");
  const clubs = await clubsWhereOfficer(me.id);

  return (
    <div className="shell" style={{ maxWidth: 820 }}>
      <div className="page-head">
        <p className="eyebrow">Proposal</p>
        <h1>Propose an event</h1>
        <p className="lede">
          Submit the details for review. Once approved you publish it, and registration opens with
          database-enforced capacity and an automatic waitlist.
        </p>
      </div>
      {messages.error ? <Notice tone="danger">{messages.error}</Notice> : null}

      <form action={createEventAction} className="card">
        <div className="field">
          <label htmlFor="title">Event title</label>
          <input className="input" id="title" name="title" required minLength={3} maxLength={160} />
        </div>
        <div className="field">
          <label htmlFor="summary">One-line summary</label>
          <input className="input" id="summary" name="summary" required minLength={20} maxLength={300} />
        </div>
        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea className="textarea" id="description" name="description" required minLength={40} maxLength={10000} rows={6} />
        </div>
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="category">Category</label>
            <select className="select" id="category" name="category" required defaultValue="academic">
              {EVENT_CATEGORIES.map((category) => (
                <option key={category} value={category}>{categoryLabel(category)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="clubId">Hosted by a club? <span className="hint">(optional)</span></label>
            <select className="select" id="clubId" name="clubId" defaultValue="">
              <option value="">Campus-wide / personal</option>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>{club.name} ({club.role})</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="startsAt">Starts</label>
            <input className="input" id="startsAt" name="startsAt" type="datetime-local" required />
          </div>
          <div className="field">
            <label htmlFor="endsAt">Ends</label>
            <input className="input" id="endsAt" name="endsAt" type="datetime-local" required />
          </div>
        </div>
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="timezone">Timezone</label>
            <select className="select" id="timezone" name="timezone" defaultValue="Africa/Tunis">
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="capacity">Capacity <span className="hint">(leave empty for unlimited)</span></label>
            <input className="input" id="capacity" name="capacity" type="number" min={1} max={10000} />
          </div>
        </div>
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="venueName">Venue name</label>
            <input className="input" id="venueName" name="venueName" maxLength={200} placeholder="e.g. Main auditorium" />
          </div>
          <div className="field">
            <label htmlFor="venueAddress">Venue address <span className="hint">(optional)</span></label>
            <input className="input" id="venueAddress" name="venueAddress" maxLength={300} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="onlineUrl">Online meeting link <span className="hint">(if hybrid or online)</span></label>
          <input className="input" id="onlineUrl" name="onlineUrl" type="url" maxLength={600} placeholder="https://" />
          <span className="hint">Provide a venue, an online link, or both.</span>
        </div>
        <div className="field">
          <label htmlFor="accessibilityNotes">Accessibility information</label>
          <textarea className="textarea" id="accessibilityNotes" name="accessibilityNotes" rows={2} maxLength={1500} placeholder="Step-free access, quiet room, captioning…" />
        </div>
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="contactEmail">Contact email <span className="hint">(optional)</span></label>
            <input className="input" id="contactEmail" name="contactEmail" type="email" maxLength={320} />
          </div>
          <div className="field" style={{ alignSelf: "end" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 46 }}>
              <input type="checkbox" name="waitlistEnabled" defaultChecked />
              Enable a waitlist when full
            </label>
          </div>
        </div>

        <div className="row">
          <SubmitButton className="btn btn-primary" pendingLabel="Saving…" name="intent" value="draft">Save draft</SubmitButton>
          <SubmitButton className="btn btn-secondary" pendingLabel="Submitting…" name="intent" value="submit">Submit for review</SubmitButton>
        </div>
        <p className="tiny muted mt-1">
          Drafts stay private. Submitted events go to the super-admin queue.{" "}
          <Link href="/dashboard">Back to dashboard</Link>
        </p>
      </form>
    </div>
  );
}
