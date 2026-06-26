import { cn } from "@/lib/utils";

/**
 * Central team-flag glyph.
 * -------------------------
 * 46 of the 48 teams use a regional-indicator emoji flag (kept verbatim). England
 * and Scotland have no ISO 3166-1 country flag, and their subdivision flag emoji
 * (🏴 + GB-ENG / GB-SCT TAG sequences) are rejected by `scripts/scan-unicode.mjs`
 * (TAG chars U+E0000–U+E007F). So those two are rendered as small inline SVGs -
 * England's St George's Cross and Scotland's Saltire - keeping them visually
 * distinct, accessible, dependency-free, and gate-safe. No remote crest URLs.
 *
 * This is the single rendering path for a team flag; surfaces pass the team's
 * `countryCode` + emoji `flag` + `name`. It renders ONLY the glyph (the name is
 * still rendered by the caller), so it is a drop-in for the old `{team.flag}` span.
 */

type OverrideCode = "ENG" | "SCO";

const OVERRIDES = new Set<string>(["ENG", "SCO"]);

/** Is this team rendered via an inline-SVG override rather than an emoji? */
export function hasFlagOverride(countryCode: string): countryCode is OverrideCode {
  return OVERRIDES.has(countryCode.toUpperCase());
}

interface FlagGlyphProps {
  countryCode: string;
  /** Emoji flag from the dataset (used for the 46 non-override teams). */
  flag: string;
  /** Team name, for an accessible label on the override SVGs. */
  name?: string;
  /** Glyph size in px (maps to emoji font-size and SVG height). Default 18. */
  size?: number;
  className?: string;
}

/** England - St George's Cross (white field, red cross). */
function EnglandFlag({ size, label }: { size: number; label: string }) {
  return (
    <svg
      role="img"
      aria-label={label}
      width={Math.round(size * 1.4)}
      height={size}
      viewBox="0 0 60 40"
      className="inline-block shrink-0 align-middle"
    >
      <rect width="60" height="40" rx="5" fill="#ffffff" />
      <rect x="25" width="10" height="40" fill="#ce1124" />
      <rect y="15" width="60" height="10" fill="#ce1124" />
    </svg>
  );
}

/** Scotland - the Saltire (blue field, white diagonal cross). */
function ScotlandFlag({ size, label }: { size: number; label: string }) {
  return (
    <svg
      role="img"
      aria-label={label}
      width={Math.round(size * 1.4)}
      height={size}
      viewBox="0 0 60 40"
      className="inline-block shrink-0 align-middle"
    >
      <rect width="60" height="40" rx="5" fill="#005eb8" />
      <path d="M0 0 L60 40 M60 0 L0 40" stroke="#ffffff" strokeWidth="8" />
    </svg>
  );
}

/** Render a team's flag: inline SVG for England/Scotland, emoji otherwise. */
export function FlagGlyph({ countryCode, flag, name, size = 18, className }: FlagGlyphProps) {
  const code = countryCode.toUpperCase();
  const label = `${name ?? code} flag`;

  if (code === "ENG") {
    return (
      <span className={cn("inline-flex items-center", className)}>
        <EnglandFlag size={size} label={label} />
      </span>
    );
  }
  if (code === "SCO") {
    return (
      <span className={cn("inline-flex items-center", className)}>
        <ScotlandFlag size={size} label={label} />
      </span>
    );
  }

  return (
    <span
      className={cn("inline-block align-middle leading-none", className)}
      style={{ fontSize: `${size}px` }}
      aria-hidden
    >
      {flag}
    </span>
  );
}
