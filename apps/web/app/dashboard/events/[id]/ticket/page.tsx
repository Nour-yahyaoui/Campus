import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getTicketEvent } from "@campussphere/core";
import { currentUser } from "@/lib/session";
import { formatDateRange, formatDateTime } from "@/lib/format";
import { Notice, Tag } from "@/components/Pieces";
import { mintCheckInAction } from "@/app/actions/events";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata: Metadata = { title: "Check-in ticket", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

interface StoredCode {
  code: string;
  expiresAt: string;
}

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const messages = await searchParams;
  const me = await currentUser();
  if (!me) redirect(`/login?next=/dashboard/events/${id}/ticket`);

  let event;
  try {
    event = await getTicketEvent(id, me);
  } catch {
    return (
      <div className="shell" style={{ maxWidth: 620 }}>
        <div className="page-head"><h1>No ticket</h1></div>
        <Notice tone="danger">You do not have a confirmed place at this event.</Notice>
        <Link className="btn btn-secondary" href="/dashboard">Back to dashboard</Link>
      </div>
    );
  }

  const store = await cookies();
  const raw = store.get("cs_checkin_code")?.value;
  let current: StoredCode | null = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoredCode;
      if (parsed.code && Date.parse(parsed.expiresAt) > Date.now()) current = parsed;
    } catch {
      current = null;
    }
  }
  const qr = current ? await QRCode.toDataURL(current.code, { margin: 1, width: 260 }) : null;

  return (
    <div className="shell" style={{ maxWidth: 620 }}>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/dashboard">Dashboard</Link> <span aria-hidden="true">/</span> <span>Ticket</span>
      </nav>
      <div className="page-head">
        <p className="eyebrow">Check-in</p>
        <h1>{event.title}</h1>
        <p className="lede">{formatDateRange(event.startsAt, event.endsAt, event.timezone)}</p>
      </div>

      {messages.error ? <Notice tone="danger">{messages.error}</Notice> : null}

      <div className="card center">
        <Tag tone={event.registrationStatus === "attended" ? "forest" : "marigold"}>
          {event.registrationStatus === "attended" ? "Already checked in" : "Show this at the door"}
        </Tag>
        {current && qr ? (
          <>
            <div className="qr-box mt-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={`Check-in QR code for ${event.title}`} width={260} height={260} />
            </div>
            <p className="code-box mt-2" aria-label="Check-in code">{current.code}</p>
            <p className="small muted">Expires {formatDateTime(current.expiresAt)} · single use</p>
            <form action={mintCheckInAction}>
              <input type="hidden" name="eventId" value={event.id} />
              <SubmitButton className="btn btn-secondary btn-sm">Generate a fresh code</SubmitButton>
            </form>
          </>
        ) : (
          <>
            <p className="small muted mt-2">
              Codes are short-lived on purpose: generate one when you reach the door, not hours before.
              It works once and expires in two hours.
            </p>
            <form action={mintCheckInAction}>
              <input type="hidden" name="eventId" value={event.id} />
              <SubmitButton className="btn btn-primary">Generate my check-in code</SubmitButton>
            </form>
          </>
        )}
      </div>

      <p className="small muted mt-2">
        Organizers scan or type the code on the event&apos;s organizer page. The code contains no personal
        data. {event.venueName ? `Venue: ${event.venueName}.` : ""}
      </p>
    </div>
  );
}
