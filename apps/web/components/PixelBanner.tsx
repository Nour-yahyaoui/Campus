import { identiconCells, type BannerKind } from "@/lib/banner";

/**
 * A decorative pixel banner for a statistic: a coloured mosaic on a quiet
 * strip, in the spirit of a GitHub identicon. Purely presentational, so it is
 * hidden from assistive technology — the number beside it carries the meaning.
 */
export function PixelBanner({ kind }: { kind: BannerKind }) {
  const cells = identiconCells(kind);
  return (
    <div className="pixel-banner" data-kind={kind} aria-hidden="true">
      <svg viewBox="0 0 50 50" width="46" height="46" shapeRendering="crispEdges" focusable="false">
        {cells.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x * 10} y={y * 10} width="10" height="10" fill="currentColor" />
        ))}
      </svg>
    </div>
  );
}
