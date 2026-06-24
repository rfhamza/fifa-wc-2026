/**
 * Phase 1.26B - Pure provider -> RawLiveSnapshot normalizer.
 * ---------------------------------------------------------
 * Maps the illustrative provider schema (`lib/live-ingest/types`) into the existing
 * `RawLiveSnapshot` contract, keeping provider ids/codes/venues as PROVENANCE and
 * provider standings/bracket as COMPARISON ONLY. It is PURE: no network, no env, no
 * secrets, no time/RNG. `matchNumber` is canonical (`matchId = "M{n}"`); the
 * provider's native id never becomes the key. Unknown/ambiguous rows FAIL CLOSED
 * (excluded + recorded in `errors`), never silently guessed.
 */
import type { GroupId } from "@/lib/types";
import type {
  LiveIngestionSource,
  RawLiveMatch,
  RawLiveSnapshot,
} from "@/lib/live-state/types";
import type {
  NormalizationIssue,
  NormalizedResult,
  ProviderPayload,
  ProviderProvenanceRow,
} from "./types";
import {
  parseGroupId,
  resolveStage,
  resolveStatus,
  resolveTeamId,
  resolveVenueId,
} from "./mapping";

/**
 * Normalize a provider payload into the canonical contract + provenance + comparison.
 * The result's `snapshot` is what feeds `validateLiveSnapshot`/`ingestLiveSnapshot`.
 */
export function normalizeProviderPayload(payload: ProviderPayload): NormalizedResult {
  const errors: NormalizationIssue[] = [];
  const matches: RawLiveMatch[] = [];
  const provenanceRows: ProviderProvenanceRow[] = [];

  for (const pm of payload.matches) {
    const fail = (code: string, message: string) =>
      errors.push({ providerId: pm.providerId, code, message });

    const stage = resolveStage(pm.round);
    if (!stage) {
      fail("unknown-stage", `Unrecognised round "${pm.round}".`);
      continue;
    }

    const teamA = resolveTeamId(pm.homeName);
    if (!teamA) {
      fail("unknown-team", `Unmappable team "${pm.homeName}".`);
      continue;
    }
    const teamB = resolveTeamId(pm.awayName);
    if (!teamB) {
      fail("unknown-team", `Unmappable team "${pm.awayName}".`);
      continue;
    }

    let group: GroupId | undefined;
    if (stage === "group") {
      const g = pm.group ? parseGroupId(pm.group) : null;
      if (!g) {
        fail("unknown-group", `Unrecognised group "${pm.group ?? ""}" for ${pm.providerId}.`);
        continue;
      }
      group = g;
    }

    const status = resolveStatus(pm.state);
    const playable = status === "complete" || status === "in-progress";

    const match: RawLiveMatch = {
      matchId: `M${pm.matchNumber}`, // canonical key from the official match number
      stage,
      ...(group ? { group } : {}),
      teamA,
      teamB,
      status,
      kickoff: pm.kickoffUtc,
      lastUpdatedAt: payload.meta.asOf,
    };

    // Scores only for playable statuses (scheduled/postponed/etc. carry none).
    if (playable && typeof pm.homeGoals === "number" && typeof pm.awayGoals === "number") {
      match.goalsA = pm.homeGoals;
      match.goalsB = pm.awayGoals;
    }

    // Winner/penalties are knockout-only.
    if (stage !== "group" && status === "complete") {
      if (pm.winnerName) {
        const w = resolveTeamId(pm.winnerName);
        if (!w) {
          fail("unknown-winner", `Unmappable winner "${pm.winnerName}" for ${pm.providerId}.`);
          continue;
        }
        match.winner = w;
      }
      if (pm.shootout) match.penalties = { a: pm.shootout.home, b: pm.shootout.away };
    }

    matches.push(match);
    provenanceRows.push({
      matchNumber: pm.matchNumber,
      matchId: `M${pm.matchNumber}`,
      providerId: pm.providerId,
      providerRound: pm.round,
      homeCode: pm.homeCode,
      awayCode: pm.awayCode,
      venueRaw: pm.venueName,
      providerVenueId: pm.venueName ? resolveVenueId(pm.venueName) : null,
    });
  }

  const source: LiveIngestionSource = {
    sourceId: payload.meta.sourceId,
    sourceType: payload.meta.sourceType,
    sourceName: payload.meta.sourceName,
    sourceUrl: payload.meta.sourceUrl,
    lastUpdatedAt: payload.meta.retrievedAt,
    reliability: payload.meta.reliability,
  };

  const snapshot: RawLiveSnapshot = {
    sourceVersion: payload.meta.asOf,
    source,
    asOf: payload.meta.asOf,
    matches,
  };

  return {
    snapshot,
    provenance: {
      sourceId: payload.meta.sourceId,
      retrievedAt: payload.meta.retrievedAt,
      asOf: payload.meta.asOf,
      matches: provenanceRows,
    },
    comparison: {
      standings: payload.standings ?? [],
      bracket: payload.bracket ?? [],
      note: "Provider standings/bracket are comparison-only; the app derives both from results.",
    },
    errors,
  };
}
