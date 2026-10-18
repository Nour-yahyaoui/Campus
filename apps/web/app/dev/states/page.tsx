import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  AdminSkeleton,
  ClubCardsSkeleton,
  DashboardSkeleton,
  DetailSkeleton,
  EventRowsSkeleton,
  FormSkeleton,
  HeadSkeleton,
  HeroSkeleton,
  ObservatorySkeleton,
  RowsSkeleton,
  SkeletonShell,
  TableSkeleton,
} from "@/components/Skeletons";
import { ProgressDemo } from "@/components/ProgressDemo";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata: Metadata = {
  title: "Loading states",
  robots: { index: false, follow: false },
};

/**
 * The design gallery for every loading, pending and failure state.
 *
 * In production the states are on screen for as long as the data takes — around
 * 150 ms on a warm deployment, which is too short to judge. This page shows them
 * permanently, side by side, so the details (spacing, shimmer, the exact shape of
 * each placeholder) can be reviewed without throttling a phone.
 *
 * Development only. There is nothing to see here for a visitor, and a route that
 * exists only to look at itself should not ship.
 */
export default function DevStatesPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="shell">
      <div className="page-head">
        <p className="eyebrow">Design gallery · development only</p>
        <h1>Every loading state, on one page</h1>
        <p className="lede">
          Skeletons that mirror the real layout, the navigation bar, pending buttons and the failure
          panel. Nothing here fakes content: a placeholder never contains text that looks real.
        </p>
      </div>

      <section className="section" style={{ paddingTop: 0 }}>
        <h2>1 · Navigating</h2>
        <p className="small muted">
          The bar starts on <code>pointerdown</code>, creeps to 82 %, fills on commit, and stays visible for at
          least 420 ms so a fast page does not produce a flicker. While it runs, the cursor becomes a progress
          cursor.
        </p>
        <div className="panel">
          <ProgressDemo />
        </div>
      </section>

      <section className="section">
        <h2>2 · Route skeletons</h2>
        <p className="small muted">
          Each route has one that matches its own layout, so the page does not jump when the content lands.
        </p>

        <h3 className="small muted">Public page · heading, filters, cards</h3>
        <div className="demo-frame">
          <SkeletonShell label="Loading clubs">
            <HeadSkeleton chips={5} />
            <ClubCardsSkeleton count={3} />
          </SkeletonShell>
        </div>

        <h3 className="small muted" style={{ marginTop: 24 }}>
          Event list
        </h3>
        <div className="demo-frame">
          <SkeletonShell label="Loading events">
            <HeadSkeleton chips={3} />
            <EventRowsSkeleton count={4} />
          </SkeletonShell>
        </div>

        <h3 className="small muted" style={{ marginTop: 24 }}>
          Detail page · cover, title, body, sidebar
        </h3>
        <div className="demo-frame">
          <SkeletonShell label="Loading the page">
            <DetailSkeleton />
          </SkeletonShell>
        </div>
      </section>

      <section className="section">
        <h2>3 · Signed-in surfaces</h2>

        <h3 className="small muted">Dashboard</h3>
        <div className="demo-frame">
          <DashboardSkeleton />
        </div>

        <h3 className="small muted" style={{ marginTop: 24 }}>
          Admin queues · table
        </h3>
        <div className="demo-frame">
          <AdminSkeleton rows={5} cols={5} />
        </div>

        <h3 className="small muted" style={{ marginTop: 24 }}>
          Observatory · charts and percentiles
        </h3>
        <div className="demo-frame">
          <ObservatorySkeleton />
        </div>

        <h3 className="small muted" style={{ marginTop: 24 }}>
          Generic rows · tables · forms
        </h3>
        <div className="demo-frame">
          <SkeletonShell label="Loading rows">
            <RowsSkeleton count={4} avatar />
            <TableSkeleton rows={4} cols={4} />
            <FormSkeleton fields={4} />
          </SkeletonShell>
        </div>
      </section>

      <section className="section">
        <h2>4 · Pending actions</h2>
        <p className="small muted">
          A button that submitted says so, keeps its width and cannot be double-sent. It is a real form, so the
          spinner behaves exactly as it does on the site.
        </p>
        <div className="panel">
          <form className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <SubmitButton>Idle button</SubmitButton>
            <SubmitButton className="btn btn-secondary">Secondary</SubmitButton>
            <SubmitButton className="btn btn-ghost" pendingLabel="Saving…">
              Ghost
            </SubmitButton>
          </form>
        </div>
      </section>

      <section className="section">
        <h2>5 · Hero skeleton</h2>
        <div className="demo-frame">
          <SkeletonShell label="Loading the home page">
            <HeroSkeleton />
          </SkeletonShell>
        </div>
      </section>
    </div>
  );
}
