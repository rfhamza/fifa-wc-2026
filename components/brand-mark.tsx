import { cn } from "@/lib/utils";

/**
 * BeyondVAR app mark — original, local SVG "goal heatmap". The goal mouth rendered as
 * a 3×3 probability grid: each zone shaded by likelihood, and in the hottest zone the
 * cell becomes the ball (a solid circle). The net mesh, the odds, and the finish in a
 * single glyph. Drawn from scratch with plain rects/circle in `currentColor` so it
 * inherits the surrounding text colour (opacity carries the heat gradient).
 *
 * IP-safe by construction: no trophy silhouette, no official emblem, wordmark or
 * event typeface, no federation crests, no external or scraped image assets —
 * geometry only.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      {/* Top row — the hottest zone (top-right) is the ball. */}
      <rect x={4} y={8} width={7.2} height={5.2} rx={1.8} fill="currentColor" opacity={0.22} />
      <rect x={12.4} y={8} width={7.2} height={5.2} rx={1.8} fill="currentColor" opacity={0.34} />
      <circle cx={24.4} cy={10.6} r={3.4} fill="currentColor" />

      {/* Middle row. */}
      <rect x={4} y={14.4} width={7.2} height={5.2} rx={1.8} fill="currentColor" opacity={0.14} />
      <rect x={12.4} y={14.4} width={7.2} height={5.2} rx={1.8} fill="currentColor" opacity={0.22} />
      <rect x={20.8} y={14.4} width={7.2} height={5.2} rx={1.8} fill="currentColor" opacity={0.3} />

      {/* Bottom row — coolest zones. */}
      <rect x={4} y={20.8} width={7.2} height={5.2} rx={1.8} fill="currentColor" opacity={0.1} />
      <rect x={12.4} y={20.8} width={7.2} height={5.2} rx={1.8} fill="currentColor" opacity={0.14} />
      <rect x={20.8} y={20.8} width={7.2} height={5.2} rx={1.8} fill="currentColor" opacity={0.2} />
    </svg>
  );
}
