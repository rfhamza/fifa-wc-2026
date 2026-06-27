import { describe, expect, it } from "vitest";
import { teams, getTeam } from "@/lib/data";
import { MODEL_WEIGHTS } from "@/lib/model/config";

/**
 * Phase 1.28Q-G3 (PR-4B) - manager DATA correctness guard. The previous repo data marked
 * many teams' managers as same-nationality when they are foreign (e.g. England/Tuchel,
 * Brazil/Ancelotti). This pins the corrected `sameNationalityManager` + `managerNationality`
 * values against the supplied manager reference, and asserts NO model weight changed (this
 * is a data-only correction; `MODEL_WEIGHTS.manager` stays 15).
 *
 * Dual-nationality review cases (manager not of the team's nationality -> false):
 *   - Algeria: Vladimir Petković (Swiss-Bosnian)
 *   - Panama:  Thomas Christiansen (Danish-Spanish)
 */

// Expected manager nationality + flag from the reference table (active = official dataset).
const EXPECTED: Record<string, { nat: string; same: boolean }> = {
  england: { nat: "Germany", same: false }, // Tuchel
  brazil: { nat: "Italy", same: false }, // Ancelotti
  portugal: { nat: "Spain", same: false }, // R. Martínez
  usa: { nat: "Argentina", same: false }, // Pochettino
  switzerland: { nat: "Switzerland", same: true }, // Yakin
  sweden: { nat: "England", same: false }, // Potter
  tunisia: { nat: "France", same: false }, // Renard
  "new-zealand": { nat: "England", same: false }, // Bazeley
  jordan: { nat: "Tunisia", same: false }, // Sellami
  uzbekistan: { nat: "Italy", same: false }, // Cannavaro
  ghana: { nat: "Portugal", same: false }, // Queiroz
  "south-africa": { nat: "Belgium", same: false }, // Broos
  algeria: { nat: "Switzerland", same: false }, // Petković (dual; not Algerian)
  panama: { nat: "Denmark", same: false }, // Christiansen (dual; not Panamanian)
  ecuador: { nat: "Argentina", same: false }, // Beccacece (label was stale "Spain")
  belgium: { nat: "France", same: false }, // Garcia (label was stale "Germany")
  "saudi-arabia": { nat: "Greece", same: false }, // Donis (label was stale "France")
};

describe("corrected manager data (high-impact)", () => {
  it("England, Brazil, Portugal, USA are foreign-managed (false); Switzerland is domestic (true)", () => {
    expect(getTeam("england").sameNationalityManager).toBe(false);
    expect(getTeam("brazil").sameNationalityManager).toBe(false);
    expect(getTeam("portugal").sameNationalityManager).toBe(false);
    expect(getTeam("usa").sameNationalityManager).toBe(false);
    expect(getTeam("switzerland").sameNationalityManager).toBe(true);
  });

  it("all audited teams match the reference nationality + flag", () => {
    for (const [id, exp] of Object.entries(EXPECTED)) {
      const t = getTeam(id);
      expect({ id, nat: t.managerNationality, same: t.sameNationalityManager }).toEqual({
        id,
        nat: exp.nat,
        same: exp.same,
      });
    }
  });

  it("no stale self-nationality label remains on the foreign-managed audited teams", () => {
    for (const [id, exp] of Object.entries(EXPECTED)) {
      if (exp.same) continue; // foreign-managed only
      const t = getTeam(id);
      // A foreign manager's nationality must not equal the team's own name.
      expect(t.managerNationality, `${id} still self-labelled`).not.toBe(t.name);
    }
  });

  it("the domestic (same-nationality) manager count matches the reference (21 of 48)", () => {
    const domestic = teams.filter((t) => t.sameNationalityManager).length;
    expect(teams.length).toBe(48);
    expect(domestic).toBe(21);
  });
});

describe("no model weight/formula change in this data PR", () => {
  it("MODEL_WEIGHTS.manager remains 15", () => {
    expect(MODEL_WEIGHTS.manager).toBe(15);
  });

  it("all production weights are unchanged from their documented baseline", () => {
    expect(MODEL_WEIGHTS).toEqual({
      elo: 1.0,
      fifaRankingPerPlace: 1.4,
      fifaRankingCap: 90,
      squadQuality: 4.0,
      recentForm: 2.0,
      manager: 15,
      host: 60,
      regional: 18,
      climate: 0.8,
      structural: 10,
      tournamentContext: 15,
    });
  });
});
