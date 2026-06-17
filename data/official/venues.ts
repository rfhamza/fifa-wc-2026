import { venues as hostVenues } from "@/data/mock/venues";
import type { Venue } from "@/lib/types";

/**
 * OFFICIAL (CANDIDATE) host venues. The 16 host stadiums are publicly confirmed
 * and stable, so we reuse the same list. sourceStatus = "candidate" until the
 * official FIFA venue feed (and per-match venue assignment) is integrated.
 * Per-match venue assignment is NOT official here — see fixtures (generated).
 */
export const officialVenues: Venue[] = hostVenues;
