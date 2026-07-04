import { cn } from "@/lib/utils";

/**
 * BeyondVAR app mark — original, local SVG. Two broken orbit rings, each carrying a
 * data dot, converging on a solid centre point: probability readings orbiting the
 * score and closing in on it ("beyond the score"). Drawn from scratch with plain
 * circles/arcs in `currentColor` so it inherits the surrounding text colour.
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
      {/* Outer orbit — open at the bottom, where its data dot sits. */}
      <path
        d="M 10 26.39 A 12 12 0 1 1 22 26.39"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.4}
      />
      <circle cx={16} cy={28} r={1.7} fill="currentColor" opacity={0.55} />

      {/* Inner orbit — open at the top, where its data dot sits. */}
      <path
        d="M 19.5 9.94 A 7 7 0 1 1 12.5 9.94"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.75}
      />
      <circle cx={16} cy={9} r={1.5} fill="currentColor" opacity={0.85} />

      {/* The centre: the score everything converges on. */}
      <circle cx={16} cy={16} r={2.8} fill="currentColor" />
    </svg>
  );
}
