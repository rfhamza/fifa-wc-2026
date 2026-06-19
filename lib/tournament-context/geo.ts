/**
 * Phase 1.14 - pure geo helpers for tournament context.
 * -----------------------------------------------------
 * Great-circle distance + deterministic IANA time-zone offset. Pure and
 * dependency-free: the time-zone offset uses the built-in Intl time-zone database
 * (no network, no live data). Nothing here is wired into the prediction model.
 */

/** Mean Earth radius (km) used for the haversine distance. */
export const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle (haversine) distance in km between two lat/lon points (decimal
 * degrees). Returns 0 for identical points; NaN-safe inputs are the caller's job.
 */
export function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * UTC offset in hours (east positive) for an IANA time zone at a given instant,
 * computed deterministically from the built-in Intl time-zone database. e.g.
 * tzOffsetHours("America/New_York", "2026-06-11T19:00:00Z") === -4 (EDT).
 *
 * Works by reading the wall-clock the zone shows for the instant and differencing
 * it against the instant's UTC time. DST-correct for the supplied date.
 */
export function tzOffsetHours(timeZone: string, isoInstant: string): number {
  const date = new Date(isoInstant);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  const wallAsUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return (wallAsUtc - date.getTime()) / 3_600_000;
}
