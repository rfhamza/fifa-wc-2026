import { describe, expect, it } from "vitest";
import { officialTeams } from "@/data/official/teams";
import { validateDrawPositions } from "@/lib/data/validate";
import type { Team } from "@/lib/types";

const clone = (): Team[] => officialTeams.map((t) => ({ ...t }));

describe("draw positions", () => {
  it("assigns only the three co-hosts a source-backed draw slot", () => {
    const positioned = officialTeams.filter((t) => t.drawSlot);
    expect(positioned.map((t) => t.id).sort()).toEqual(["canada", "mexico", "usa"]);
    for (const t of positioned) {
      expect(t.drawPosition).toBe(1);
      expect(t.drawSlotStatus).toBe("verified");
    }
  });

  it("places hosts in their regulation slots (Mexico A1, Canada B1, USA D1)", () => {
    const slot = (id: string) => officialTeams.find((t) => t.id === id)!.drawSlot;
    expect(slot("mexico")).toBe("A1");
    expect(slot("canada")).toBe("B1");
    expect(slot("usa")).toBe("D1");
  });

  it("leaves all non-host draw positions undefined (no placeholders stored)", () => {
    const hosts = new Set(["mexico", "canada", "usa"]);
    for (const t of officialTeams) {
      if (!hosts.has(t.id)) {
        expect(t.drawPosition).toBeUndefined();
        expect(t.drawSlot).toBeUndefined();
        expect(t.drawSlotStatus).toBeUndefined();
      }
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
