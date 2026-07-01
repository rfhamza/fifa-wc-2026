"use client";

import { FilterPills } from "@/components/ui/filter-pills";
import { MOVEMENT_STAGE_OPTIONS, type MovementStage } from "@/lib/ui/forecast-movement";

/** Thin wrapper: the five-stage selector (Title / Reach final / … / Reach round of 16). */
export function MovementStageSelector({
  value,
  onChange,
}: {
  value: MovementStage;
  onChange: (stage: MovementStage) => void;
}) {
  return (
    <FilterPills
      options={MOVEMENT_STAGE_OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel="Choose the stage to view movement for"
    />
  );
}
