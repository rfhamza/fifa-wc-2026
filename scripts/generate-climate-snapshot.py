#!/usr/bin/env python3
"""Phase 1.13 - deterministic generator for the climate-suitability snapshot.

Reads home-country 1991-2020 monthly climate normals from LOCAL, UNCOMMITTED
source exports and emits data/model-inputs/snapshots/climate-suitability-1991-2020.ts
deterministically (stable ordering + fixed numeric formatting), so the committed
TypeScript snapshot is reproducible and is NEVER hand-transcribed. The raw source
files are NOT committed.

Sources
-------
* CCKP (World Bank Climate Knowledge Portal), CRU TS4.09 monthly climatology
  1991-2020, country-aggregated exports (sheet "all", columns code,name,1991-01..1991-12
  - the 12 columns are the Jan..Dec climate-normal values for the 1991-2020 period,
  NOT single-year 1991 data):
    - tas (mean air temperature, deg C)  -> --tas
    - pr  (precipitation, mm/month)      -> --pr
  All 46 sovereign WC economies (incl. Curacao / CUW) are present -> `source-backed`.
  CRU exports trace/near-zero arid-month precipitation as blank; blanks are
  interpreted as 0.0 mm (documented; score-neutral - 0 mm yields zero rain penalty).
* Met Office / HadUK-Grid constituent areal series (England, Scotland), monthly
  mean air temperature + total precipitation. We filter years 1991-2020 inclusive,
  ignore the seasonal/annual columns, and average each calendar month across the 30
  years -> 12 monthly normals each -> `official-derived` (NOT CCKP GBR; NOT
  parent-mapped to the United Kingdom).

Usage
-----
  python3 scripts/generate-climate-snapshot.py \
    --tas <cru_tas.xlsx> --pr <cru_pr.xlsx> \
    --eng-temp <England_mean_temp.txt> --eng-rain <England_rainfall.txt> \
    --sco-temp <Scotland_mean_temp.txt> --sco-rain <Scotland_rainfall.txt>

Requires openpyxl (already available in the dev environment).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import openpyxl

# 46 World Cup economies present in the CCKP export: app team id -> ISO3 code.
# (Same teams/codes as the structural-economic-2024 snapshot; England + Scotland
# come from the Met Office files, never from CCKP GBR.)
TEAM_TO_ISO3: dict[str, str] = {
    "algeria": "DZA", "argentina": "ARG", "australia": "AUS", "austria": "AUT",
    "belgium": "BEL", "bosnia-herzegovina": "BIH", "brazil": "BRA", "canada": "CAN",
    "cape-verde": "CPV", "colombia": "COL", "congo-dr": "COD", "croatia": "HRV",
    "curacao": "CUW", "czechia": "CZE", "ecuador": "ECU", "egypt": "EGY",
    "france": "FRA", "germany": "DEU", "ghana": "GHA", "haiti": "HTI",
    "iran": "IRN", "iraq": "IRQ", "ivory-coast": "CIV", "japan": "JPN",
    "jordan": "JOR", "mexico": "MEX", "morocco": "MAR", "netherlands": "NLD",
    "new-zealand": "NZL", "norway": "NOR", "panama": "PAN", "paraguay": "PRY",
    "portugal": "PRT", "qatar": "QAT", "saudi-arabia": "SAU", "senegal": "SEN",
    "south-africa": "ZAF", "south-korea": "KOR", "spain": "ESP", "sweden": "SWE",
    "switzerland": "CHE", "tunisia": "TUN", "turkiye": "TUR", "uruguay": "URY",
    "usa": "USA", "uzbekistan": "UZB",
}

YEAR_MIN, YEAR_MAX = 1991, 2020


def read_cckp(path: Path) -> dict[str, tuple[str, list[float | None]]]:
    """ISO3 -> (display name, [12 monthly values]); None preserved for blanks."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["all"]
    out: dict[str, tuple[str, list[float | None]]] = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        code = row[0]
        if not code:
            continue
        name = str(row[1]).strip() if row[1] is not None else ""
        vals = [None if v is None else float(v) for v in row[2:14]]
        out[str(code).strip()] = (name, vals)
    return out


def read_metoffice(path: Path) -> list[float]:
    """12 calendar-month means averaged over YEAR_MIN..YEAR_MAX inclusive."""
    sums = [0.0] * 12
    counts = [0] * 12
    header_seen = False
    for raw in path.read_text(encoding="utf-8", errors="strict").splitlines():
        parts = raw.split()
        if not parts:
            continue
        if not header_seen:
            if parts[0].lower() == "year":
                header_seen = True
            continue
        try:
            year = int(parts[0])
        except ValueError:
            continue
        if year < YEAR_MIN or year > YEAR_MAX:
            continue
        # columns 1..12 are jan..dec; ignore win/spr/sum/aut/ann afterwards.
        for m in range(12):
            cell = parts[1 + m]
            if cell == "---":
                continue
            sums[m] += float(cell)
            counts[m] += 1
    means = []
    for m in range(12):
        if counts[m] != (YEAR_MAX - YEAR_MIN + 1):
            raise SystemExit(
                f"{path.name}: month {m + 1} has {counts[m]} of "
                f"{YEAR_MAX - YEAR_MIN + 1} years 1991-2020"
            )
        means.append(sums[m] / counts[m])
    return means


def fmt_arr(vals: list[float], nd: int) -> str:
    return "[" + ", ".join(f"{round(v, nd):.{nd}f}" for v in vals) + "]"


def row_literal(team: str, name: str, code: str, temp: list[float],
                precip: list[float], status: str) -> str:
    esc = name.replace("\\", "\\\\").replace('"', '\\"')
    return (
        f'  {{ teamId: "{team}", countryNameRaw: "{esc}", climateCode: "{code}", '
        f"monthlyTempC: {fmt_arr(temp, 2)}, monthlyPrecipMm: {fmt_arr(precip, 2)}, "
        f'baselinePeriod: "1991-2020", dataStatus: "{status}" }},'
    )


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--tas", required=True, type=Path)
    p.add_argument("--pr", required=True, type=Path)
    p.add_argument("--eng-temp", required=True, type=Path)
    p.add_argument("--eng-rain", required=True, type=Path)
    p.add_argument("--sco-temp", required=True, type=Path)
    p.add_argument("--sco-rain", required=True, type=Path)
    p.add_argument(
        "--out", type=Path,
        default=Path("data/model-inputs/snapshots/climate-suitability-1991-2020.ts"),
    )
    args = p.parse_args()

    tas = read_cckp(args.tas)
    pr = read_cckp(args.pr)

    rows: list[str] = []
    code_map: list[str] = []
    # Deterministic order: source-backed teams sorted by app id, then England/Scotland.
    for team in sorted(TEAM_TO_ISO3):
        code = TEAM_TO_ISO3[team]
        if code not in tas or code not in pr:
            raise SystemExit(f"missing CCKP data for {team} ({code})")
        name, temp = tas[code]
        _, precip_raw = pr[code]
        if any(t is None for t in temp):
            raise SystemExit(f"{team} ({code}): missing monthly temperature value")
        # CRU blank precip = trace/near-zero arid month -> 0.0 mm (documented).
        precip = [0.0 if v is None else v for v in precip_raw]
        rows.append(row_literal(team, name, code, temp, precip, "source-backed"))
        code_map.append(f'  {code}: "{team}",')

    eng = (read_metoffice(args.eng_temp), read_metoffice(args.eng_rain))
    sco = (read_metoffice(args.sco_temp), read_metoffice(args.sco_rain))
    derived = [
        row_literal("england", "England", "", eng[0], eng[1], "official-derived"),
        row_literal("scotland", "Scotland", "", sco[0], sco[1], "official-derived"),
    ]

    header = '''import type { ClimateSuitabilityRow, ModelInputSource } from "@/lib/types";

/**
 * Phase 1.13 - climate-suitability snapshot (home-country 1991-2020 normals).
 * ---------------------------------------------------------------------------
 * GENERATED by scripts/generate-climate-snapshot.py - DO NOT EDIT BY HAND.
 *
 * Home-country monthly climate normals feeding the Klement/Joachim year-round
 * football-playability pillar. Raw monthly arrays are the trustworthy inputs; the
 * DERIVED 12-month playability suitability score (lib/model/climate-suitability.ts)
 * is a documented `candidate` heuristic, NOT source-backed.
 *
 * Provenance (MIXED family, status `candidate`):
 *  - 46 sovereign economies: World Bank Climate Knowledge Portal, CRU TS4.09
 *    monthly climatology 1991-2020 (tas deg C, pr mm/month). `source-backed`.
 *    CRU exports trace/near-zero arid-month precipitation as blank; blanks are
 *    stored here as 0.0 mm (documented; score-neutral). e.g. Qatar Jun-Sep.
 *  - England + Scotland: Met Office / HadUK-Grid constituent areal series,
 *    calendar-month means over 1991-2020. `official-derived` - NOT CCKP `GBR` and
 *    NOT parent-mapped to the United Kingdom.
 *
 * Raw source exports (CCKP .xlsx, Met Office .txt) are NOT committed. See
 * docs/CLIMATE_SUITABILITY_SNAPSHOT_AUDIT.md.
 */
export const CLIMATE_SUITABILITY_SOURCE: ModelInputSource = {
  family: "climateFamiliarity",
  label: "Climate suitability (home-country year-round playability)",
  sourceName: "World Bank Climate Knowledge Portal (CRU TS4.09); Met Office / HadUK-Grid",
  sourceUrl: "https://climateknowledgeportal.worldbank.org/",
  sourceDate: "1991-2020",
  retrievedAt: "2026-06-19",
  status: "candidate",
  notes:
    "MIXED family (candidate): 46 economies are source-backed monthly climate normals from the World Bank Climate Knowledge Portal (CRU TS4.09, 1991-2020; tas deg C + pr mm/month, published values used as-is; CRU blank arid-month precipitation stored as 0.0 mm). England + Scotland are official-derived from Met Office / HadUK-Grid constituent series (calendar-month means over 1991-2020) - NOT CCKP GBR and NOT parent-mapped to the UK. The DERIVED 12-month playability suitability score is a documented candidate heuristic (calibration deferred), capped at +/-25 Elo-equivalent pts; model weight unchanged.",
};

/** CCKP / ISO3 economy code -> app team id (source-backed rows only). */
export const CLIMATE_CODE_TO_ID: Record<string, string> = {
'''

    derived_comment = (
        "  // --- official-derived: UK constituent FAs, Met Office / HadUK-Grid "
        "calendar-month\n"
        "  // means over 1991-2020 (NOT CCKP GBR; NOT parent-mapped to the United Kingdom) ---"
    )

    body = (
        header
        + "\n".join(code_map)
        + "\n};\n\n"
        + "/** The 48 World Cup teams' home-country 1991-2020 monthly climate normals. */\n"
        + "export const climateSuitabilitySnapshot: ClimateSuitabilityRow[] = [\n"
        + "\n".join(rows)
        + "\n"
        + derived_comment
        + "\n"
        + "\n".join(derived)
        + "\n];\n"
    )

    args.out.write_text(body, encoding="utf-8")
    print(f"wrote {args.out} ({len(rows) + len(derived)} rows)", file=sys.stderr)


if __name__ == "__main__":
    main()
