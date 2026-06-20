import { describe, expect, it } from "vitest";
import {
  squadSnapshot,
  squadById,
  SQUAD_SOURCE,
} from "@/data/model-inputs/snapshots/squad-2026-06-11";
import { officialTeams } from "@/data/official/teams";
import { validateSquad } from "@/lib/data/validate-squad";
import type { SquadRow } from "@/lib/types";

const LEAKAGE_STATUS =
  "official_fifa_final_squad_pdf_post_tournament_start_version_leakage_risk";
const FORBIDDEN = ["marketValue", "playerRating", "fifaRating", "sofifaRating", "eaRating", "overall", "potential", "wage"];

describe("squad snapshot - coverage & validity", () => {
  it("covers 48 teams x 26 players (1248 total), one row per official team", () => {
    expect(squadSnapshot).toHaveLength(48);
    expect(squadSnapshot.reduce((s, r) => s + r.players.length, 0)).toBe(1248);
    const ids = new Set(officialTeams.map((t) => t.id));
    for (const r of squadSnapshot) {
      expect(ids.has(r.teamId)).toBe(true);
      expect(r.players).toHaveLength(26);
      expect(r.aggregates.playerCount).toBe(26);
    }
    expect(new Set(squadSnapshot.map((r) => r.teamId)).size).toBe(48);
  });

  it("has valid player rows (position, DOB, age, height, caps, goals)", () => {
    for (const r of squadSnapshot) {
      for (const p of r.players) {
        expect(["GK", "DF", "MF", "FW"]).toContain(p.position);
        expect(p.dateOfBirth).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(p.ageAtTournamentStart).toBeGreaterThanOrEqual(15);
        expect(p.ageAtTournamentStart).toBeLessThanOrEqual(45);
        expect(p.heightCm).toBeGreaterThanOrEqual(150);
        expect(p.heightCm).toBeLessThanOrEqual(220);
        expect(Number.isInteger(p.caps)).toBe(true);
        expect(p.caps).toBeGreaterThanOrEqual(0);
        expect(p.goals).toBeGreaterThanOrEqual(0);
        expect(p.playerName.length).toBeGreaterThan(0);
        expect(p.club.length).toBeGreaterThan(0);
      }
    }
  });

  it("preserves the leakage-risk status, final type and dates", () => {
    for (const r of squadSnapshot) {
      expect(r.squadType).toBe("final");
      expect(r.squadDate).toBe("2026-06-20");
      expect(r.squadFreezeDate).toBe("2026-06-10");
      expect(r.dataStatus).toBe(LEAKAGE_STATUS);
      expect(r.sourceRef.length).toBeGreaterThan(0);
    }
    expect(SQUAD_SOURCE.leakageRisk).toBe(true);
    expect(SQUAD_SOURCE.status).toBe("source-backed");
    expect(SQUAD_SOURCE.dataStatus).toBe(LEAKAGE_STATUS);
  });

  it("records the supplied file SHA-256 anchors", () => {
    expect(SQUAD_SOURCE.playerCsvSha256).toBe("b155454428964a5bd9de63611e0897fb5a1d760b38926403c9889c0c848ecf2f");
    expect(SQUAD_SOURCE.aggregateCsvSha256).toBe("47ba078e3751f3198b4c1493991798aace639471127ebf74687299da25458c4a");
    expect(SQUAD_SOURCE.xlsxSha256).toBe("9db68c6dfea77dced9377c37a5df84cfdc565cae9e2774571badb02707ecde5d");
  });

  it("carries NO forbidden proprietary rating/value fields", () => {
    for (const r of squadSnapshot) {
      for (const k of FORBIDDEN) {
        expect(Object.prototype.hasOwnProperty.call(r.aggregates, k)).toBe(false);
        for (const p of r.players) {
          expect(Object.prototype.hasOwnProperty.call(p, k)).toBe(false);
        }
      }
    }
  });

  it("keeps clubStrengthScore / squadDepthScore deferred (null), and top-5 is an association proxy", () => {
    for (const r of squadSnapshot) {
      expect(r.aggregates.clubStrengthScore).toBeNull();
      expect(r.aggregates.squadDepthScore).toBeNull();
      // proxy share in [0,1]
      expect(r.aggregates.top5AssociationCountryShare).toBeGreaterThanOrEqual(0);
      expect(r.aggregates.top5AssociationCountryShare).toBeLessThanOrEqual(1);
    }
  });

  it("recomputes aggregates from player rows (spot check Argentina)", () => {
    const arg = squadById.get("argentina")!;
    const totalCaps = arg.players.reduce((s, p) => s + p.caps, 0);
    expect(arg.aggregates.totalCaps).toBe(totalCaps);
    expect(arg.aggregates.goalkeepersCount).toBe(arg.players.filter((p) => p.position === "GK").length);
    const sumPos = arg.aggregates.goalkeepersCount + arg.aggregates.defendersCount + arg.aggregates.midfieldersCount + arg.aggregates.forwardsCount;
    expect(sumPos).toBe(26);
  });

  it("passes validateSquad with no errors", () => {
    const res = validateSquad();
    expect(res.errors).toEqual([]);
    expect(res.valid).toBe(true);
  });
});

describe("squad snapshot - validator negative cases", () => {
  it("flags a forbidden proprietary field on a player", () => {
    const bad: SquadRow[] = squadSnapshot.map((r, i) =>
      i === 0
        ? { ...r, players: r.players.map((p, j) => (j === 0 ? { ...p, marketValue: 1_000_000 } : p)) }
        : r,
    ) as unknown as SquadRow[];
    expect(validateSquad(bad).errors.join(" ")).toMatch(/forbidden field "marketValue"/);
  });

  it("flags loss of the leakage-risk status", () => {
    const bad: SquadRow[] = squadSnapshot.map((r, i) =>
      i === 0 ? { ...r, dataStatus: "verified_pre_start" } : r,
    );
    expect(validateSquad(bad).errors.join(" ")).toMatch(/leakage-risk status/);
  });

  it("flags a wrong player count", () => {
    const bad: SquadRow[] = squadSnapshot.map((r, i) =>
      i === 0 ? { ...r, players: r.players.slice(0, 25) } : r,
    );
    expect(validateSquad(bad).valid).toBe(false);
  });

  it("flags a broken aggregate", () => {
    const bad: SquadRow[] = squadSnapshot.map((r, i) =>
      i === 0 ? { ...r, aggregates: { ...r.aggregates, totalCaps: r.aggregates.totalCaps + 1 } } : r,
    );
    expect(validateSquad(bad).errors.join(" ")).toMatch(/totalCaps/);
  });
});
