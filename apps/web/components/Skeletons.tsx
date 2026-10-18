import type { CSSProperties, ReactNode } from "react";

/**
 * Loading placeholders.
 *
 * Next.js renders these the instant a navigation starts, before the server has
 * finished the data work. That is the whole point: a page that waits 300 ms in
 * silence feels broken, the same page with its own shape on screen feels fast.
 *
 * Rules followed here:
 *  - The skeleton mirrors the real layout (same grid, same card heights), so the
 *    page does not jump when content arrives.
 *  - It contains no fake text — only neutral blocks. A placeholder that reads
 *    like content is a lie for the length of a slow query.
 *  - Each one carries `role="status"`, `aria-busy` and a visually hidden label,
 *    so a screen reader announces loading instead of reading a wall of nothing.
 */

function Bar({
  width,
  height = 14,
  radius,
  className = "",
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton ${className}`.trim()}
      style={{
        display: "block",
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

export function SkeletonShell({ children, label = "Loading" }: { children: ReactNode; label?: string }) {
  return (
    <div className="shell sk-shell sk-enter" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}

export function HeadSkeleton({ chips = 4 }: { chips?: number }) {
  return (
    <div className="sk-head">
      <Bar width={92} height={12} />
      <Bar width="min(420px, 72%)" height={40} className="sk-title" />
      <Bar width="min(560px, 92%)" height={16} />
      <Bar width="min(460px, 78%)" height={16} />
      <div className="sk-chips">
        {Array.from({ length: chips }, (_, index) => (
          <Bar key={index} width={index % 2 ? 96 : 74} height={24} radius={999} />
        ))}
      </div>
    </div>
  );
}

export function SearchBarSkeleton() {
  return (
    <div className="sk-search">
      <Bar height={46} radius={12} width="100%" />
      <Bar height={38} width={104} radius={10} />
    </div>
  );
}

export function ClubCardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid-3">
      {Array.from({ length: count }, (_, index) => (
        <div className="sk-card" key={index}>
          <div className="sk-row">
            <Bar width={42} height={42} radius={13} />
            <div className="sk-grow">
              <Bar width="68%" height={18} />
              <Bar width="90%" height={12} style={{ marginTop: 8 }} />
            </div>
          </div>
          <div className="sk-chips">
            <Bar width={78} height={22} radius={999} />
            <Bar width={54} height={22} radius={999} />
          </div>
          <div className="sk-chips">
            <Bar width={86} height={12} />
            <Bar width={110} height={12} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProjectCardsSkeleton({ count = 6 }: { count?: number }) {
  return <ClubCardsSkeleton count={count} />;
}

export function EventRowsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="sk-list">
      {Array.from({ length: count }, (_, index) => (
        <div className="sk-event-row" key={index}>
          <Bar width={54} height={58} radius={12} />
          <div className="sk-grow">
            <Bar width={`${52 + ((index * 13) % 30)}%`} height={20} />
            <Bar width="88%" height={12} style={{ marginTop: 10 }} />
            <Bar width="70%" height={12} style={{ marginTop: 6 }} />
            <div className="sk-chips" style={{ marginTop: 10 }}>
              <Bar width={64} height={20} radius={999} />
              <Bar width={82} height={20} radius={999} />
              <Bar width={120} height={12} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RowsSkeleton({ count = 8, avatar = false }: { count?: number; avatar?: boolean }) {
  return (
    <div className="sk-list">
      {Array.from({ length: count }, (_, index) => (
        <div className="sk-row sk-row-bordered" key={index}>
          {avatar ? <Bar width={34} height={34} radius={999} /> : null}
          <div className="sk-grow">
            <Bar width={`${40 + ((index * 17) % 40)}%`} height={15} />
            <Bar width={`${55 + ((index * 11) % 30)}%`} height={11} style={{ marginTop: 7 }} />
          </div>
          <Bar width={64} height={22} radius={999} />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="table-wrap" aria-hidden="true">
      <table className="data">
        <thead>
          <tr>
            {Array.from({ length: cols }, (_, index) => (
              <th key={index}>
                <Bar width={index === 0 ? 90 : 64} height={10} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: cols }, (_, colIndex) => (
                <td key={colIndex}>
                  <Bar
                    width={colIndex === 0 ? `${55 + ((rowIndex * 9) % 35)}%` : `${35 + ((rowIndex * 7 + colIndex * 5) % 40)}%`}
                    height={12}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MiniStatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="stat-row sk-stat-row">
      {Array.from({ length: count }, (_, index) => (
        <div className="mini-stat" key={index}>
          <Bar width={44} height={26} />
          <Bar width={90} height={11} style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid-2">
      {Array.from({ length: count }, (_, index) => (
        <div className="card sk-card" key={index}>
          <Bar width={120} height={12} />
          <Bar width={72} height={30} />
          <Bar width="80%" height={12} />
        </div>
      ))}
    </div>
  );
}

/** Club, project and event detail pages share this shape. */
export function DetailSkeleton({ cover = true }: { cover?: boolean }) {
  return (
    <SkeletonShell label="Loading page">
      <div className="sk-head">
        <Bar width={168} height={12} />
        {cover ? <Bar height={220} radius={16} width="100%" style={{ marginTop: 14 }} /> : null}
        <div className="sk-row" style={{ marginTop: 18 }}>
          <Bar width={48} height={48} radius={13} />
          <div className="sk-grow">
            <Bar width="min(420px, 78%)" height={38} />
            <Bar width="min(520px, 90%)" height={14} style={{ marginTop: 10 }} />
          </div>
        </div>
        <div className="sk-chips">
          <Bar width={78} height={22} radius={999} />
          <Bar width={110} height={22} radius={999} />
          <Bar width={92} height={22} radius={999} />
        </div>
      </div>
      <div className="split mt-2">
        <div className="sk-card">
          <Bar width="40%" height={20} />
          <Bar width="100%" height={12} />
          <Bar width="96%" height={12} />
          <Bar width="88%" height={12} />
          <Bar width="72%" height={12} />
          <Bar width="100%" height={12} />
          <Bar width="81%" height={12} />
        </div>
        <div className="stack">
          <div className="sk-card">
            <Bar width="55%" height={16} />
            <Bar width="100%" height={40} radius={10} />
            <Bar width="100%" height={40} radius={10} />
          </div>
          <div className="sk-card">
            <Bar width="45%" height={16} />
            <RowsSkeleton count={3} avatar />
          </div>
        </div>
      </div>
    </SkeletonShell>
  );
}

export function FormSkeleton({ fields = 5, wide = false }: { fields?: number; wide?: boolean }) {
  return (
    <div className={wide ? "sk-card" : "sk-card sk-card-narrow"}>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="sk-field">
          <Bar width={index % 3 === 0 ? 120 : 88} height={11} />
          <Bar width="100%" height={index % 3 === 0 ? 92 : 44} radius={10} style={{ marginTop: 6 }} />
        </div>
      ))}
      <div className="sk-chips" style={{ marginTop: 8 }}>
        <Bar width={132} height={40} radius={10} />
        <Bar width={96} height={40} radius={10} />
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <SkeletonShell label="Loading your dashboard">
      <HeadSkeleton chips={0} />
      <MiniStatsSkeleton />
      <div className="dash-grid mt-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="sk-card" key={index}>
            <Bar width="45%" height={18} />
            <RowsSkeleton count={3} avatar />
          </div>
        ))}
      </div>
    </SkeletonShell>
  );
}

export function AdminSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <SkeletonShell label="Loading admin console">
      <HeadSkeleton chips={0} />
      <MiniStatsSkeleton />
      <div className="card mt-3">
        <div className="spread">
          <Bar width={180} height={20} />
          <Bar width={220} height={32} radius={999} />
        </div>
        <div className="mt-2">
          <TableSkeleton rows={rows} cols={cols} />
        </div>
      </div>
    </SkeletonShell>
  );
}

export function ObservatorySkeleton() {
  return (
    <SkeletonShell label="Loading the observatory">
      <HeadSkeleton chips={3} />
      <div className="stats-strip">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="stat" key={index}>
            <Bar width={70} height={24} />
            <Bar width={110} height={10} style={{ marginTop: 10 }} />
          </div>
        ))}
      </div>
      <div className="grid-2 mt-3">
        <div className="sk-card">
          <Bar width="40%" height={18} />
          <TableSkeleton rows={6} cols={3} />
        </div>
        <div className="sk-card">
          <Bar width="40%" height={18} />
          <TableSkeleton rows={6} cols={3} />
        </div>
      </div>
    </SkeletonShell>
  );
}


export function HeroSkeleton() {
  return (
    <div className="sk-hero">
      <div className="sk-hero-copy">
        <Bar width={132} height={12} />
        <Bar width="90%" height={54} radius={12} style={{ marginTop: 16 }} />
        <Bar width="64%" height={54} radius={12} style={{ marginTop: 10 }} />
        <Bar width="86%" height={15} style={{ marginTop: 18 }} />
        <Bar width="72%" height={15} style={{ marginTop: 8 }} />
        <div className="sk-chips" style={{ marginTop: 22 }}>
          <Bar width={148} height={44} radius={10} />
          <Bar width={132} height={44} radius={10} />
        </div>
        <Bar width={280} height={12} style={{ marginTop: 18 }} />
      </div>
      <div className="sk-card sk-hero-card">
        <Bar width="45%" height={14} />
        <Bar width="88%" height={22} />
        <Bar width="72%" height={22} />
        <Bar width="100%" height={120} radius={12} />
      </div>
    </div>
  );
}

export function GenericPageSkeleton() {
  return (
    <SkeletonShell>
      <HeadSkeleton />
      <ClubCardsSkeleton count={3} />
    </SkeletonShell>
  );
}

/**
 * The right-hand snapshot column of the home hero: three stacked "mini" cards.
 * Used as a Suspense fallback so the headline paints immediately and the live
 * numbers arrive underneath it.
 */
export function HeroSnapshotSkeleton() {
  return (
    <div className="sk-snapshot" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading today&apos;s campus numbers…</span>
      {[0, 1, 2].map((index) => (
        <div className="sk-snapshot-row" key={index}>
          <Bar width={58} height={58} radius={16} />
          <div style={{ flex: 1 }}>
            <Bar width={index === 0 ? "70%" : "54%"} height={16} />
            <Bar width="40%" height={12} style={{ marginTop: 8 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The four-number strip under the hero. */
export function StatsStripSkeleton() {
  return (
    <div className="stats-strip sk-stats" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading catalogue totals…</span>
      {[0, 1, 2, 3].map((index) => (
        <div className="stat" key={index}>
          <Bar width={72} height={30} radius={8} />
          <Bar width={104} height={12} style={{ marginTop: 10 }} />
        </div>
      ))}
    </div>
  );
}

/** A section heading with its cards, for streaming a whole rail below the fold. */
export function RailSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="sk-rail" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="grid-3">
        {Array.from({ length: count }, (_, index) => (
          <div className="sk-card" key={index}>
            <Bar width={44} height={44} radius={12} />
            <Bar width="72%" height={18} style={{ marginTop: 14 }} />
            <Bar width="90%" height={12} style={{ marginTop: 10 }} />
            <Bar width="60%" height={12} style={{ marginTop: 6 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
