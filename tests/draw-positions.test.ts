import { describe, expect, it } from "vitest";
import { officialTeams } from "@/data/official/teams";
import { validateDrawPositions } from "@/lib/data/validate";
import type { Team } from "@/lib/types";

const clone = (): Team[] => officialTeams.map((t) => ({ ...t }));

describe("draw positions", () => {
  it("assigns all 48 teams a verified draw slot (Phase 1.6 Step B)", () => {
    const positioned = officialTeams.filter((t) => t.drawSlot);
    expect(positioned).toHaveLength(48);
    for (const t of positioned) {
      expect(t.drawPosition).toBeGreaterThanOrEqual(1);
      expect(t.drawPosition).toBeLessThanOrEqual(4);
      expect(t.drawSlot).toBe(`${t.group}${t.drawPosition}`);
      expect(t.drawSlotStatus).toBe("verified");
    }
    // Three co-hosts keep their regulation position 1.
    for (const id of ["canada", "mexico", "usa"]) {
      expect(officialTeams.find((t) => t.id === id)!.drawPosition).toBe(1);
    }
  });

  it("places hosts in their regulation slots (Mexico A1, Canada B1, USA D1)", () => {
    const slot = (id: string) => officialTeams.find((t) => t.id === id)!.drawSlot;
    expect(slot("mexico")).toBe("A1");
    expect(slot("canada")).toBe("B1");
    expect(slot("usa")).toBe("D1");
  });

  it("has positions {1,2,3,4} unique within every group", () => {
    const byGroup = new Map<string, number[]>();
    for (const t of officialTeams) {
      const list = byGroup.get(t.group) ?? [];
      list.push(t.drawPosition!);
      byGroup.set(t.group, list);
    }
    expect(byGroup.size).toBe(12);
    for (const [, positions] of byGroup) {
      expect([...positions].sort()).toEqual([1, 2, 3, 4]);
    }
  });

  it("validates the official field's draw positions", () => {
    expect(validateDrawPositions(officialTeams)).toEqual([]);
  });

  it("rejects a host placed in the wrong slot", () => {
    const teams = clone();
    const mexico = teams.find((t) => t.id === "mexico")!;
    mexico.drawSlot = "A2";
    mexico.drawPosition = 2;
    const errors = validateDrawPositions(teams);
    expect(errors.join(" ")).toMatch(/host mexico/);
  });

  it("rejects two teams sharing a draw position in one group", () => {
    const teams = clone();
    const korea = teams.find((t) => t.id === "south-korea")!;
    korea.drawPosition = 1;
    korea.drawSlot = "A1";
    korea.drawSlotStatus = "candidate";
    const errors = validateDrawPositions(teams);
    expect(errors.join(" ")).toMatch(/duplicate draw position/);
  });

  it("rejects a drawSlot inconsistent with group + position", () => {
    const teams = clone();
    const mexico = teams.find((t) => t.id === "mexico")!;
    mexico.drawSlot = "A1"; // host check ok, but force position mismatch
    mexico.drawPosition = 3;
    const errors = validateDrawPositions(teams);
    expect(errors.join(" ")).toMatch(/drawSlot A1 != A3/);
  });
});
