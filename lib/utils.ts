import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui class merge helper. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a 0..1 probability as a percentage string, e.g. 0.421 → "42%". */
export function pct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** Clamp a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Round to a fixed number of decimals (avoids floating-point noise in UI). */
export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** Signed percentage delta for movers, e.g. +0.05 → "+5.0%". */
export function signedPct(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(digits)}%`;
}
