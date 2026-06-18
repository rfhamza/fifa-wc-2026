#!/usr/bin/env python3
"""
Dev-only extractor for the Phase 1.5 CANDIDATE schedule layer.

WHAT THIS DOES
  Reads the third-party "FIFA World Cup 2026 Interactive Schedule" Excel
  workbook (a fan-made tool, "Free V2.62") and emits a derived JSON snapshot
  (data/candidate/raw/excel-matches.json) used only to STAGE and CROSS-CHECK a
  candidate group-stage schedule. It also solves each group's candidate draw
  order from the Article 12.4 pairing chart implied by the match list.

WHAT THIS IS NOT
  - NOT official FIFA schedule data. The workbook is a third-party source.
  - NOT used at runtime. The typed TypeScript under data/candidate/ is the
    runtime artifact; nothing imports this script or its xlsx input in prod.
  - The source .xlsx binary is intentionally NOT committed (third-party
    copyright / unclear redistribution). Only the derived JSON is committed,
    with the provenance header below. Point --xlsx at your local copy to
    reproduce.

USAGE
  python3 scripts/extract-candidate-schedule.py \
      --xlsx /path/to/FIFAWorldCup2026InteractiveSchedule...Free.xlsx \
      --out  data/candidate/raw/excel-matches.json

DEPENDENCIES
  Python 3 standard library only (zipfile + xml.etree). No pip installs, and
  no runtime dependencies are added to the app.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import xml.etree.ElementTree as ET
import zipfile
from itertools import permutations

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# Article 12.4 single round-robin by draw position (home, away).
ARTICLE_12_4 = [(1, 2), (3, 4), (1, 3), (4, 2), (4, 1), (2, 3)]

# The workbook places match #1 on row 4 of the Matches sheet; 72 group rows.
MATCHES_FIRST_ROW = 4
GROUP_MATCH_COUNT = 72

# Excel serial-date epoch (Windows 1900 system, with the well-known 1900 leap
# bug accounted for by anchoring at 1899-12-30).
EXCEL_EPOCH = dt.datetime(1899, 12, 30)

# Times in the workbook are New York time (ET). June 2026 is EDT (UTC-4).
ET_TO_UTC_HOURS = 4


def load_shared_strings(z: zipfile.ZipFile) -> list[str]:
    data = ET.fromstring(z.read("xl/sharedStrings.xml"))
    return ["".join(t.text or "" for t in si.iter(NS + "t")) for si in data.iter(NS + "si")]


def read_sheet(z: zipfile.ZipFile, path: str, sst: list[str]) -> dict[str, str]:
    sheet = ET.fromstring(z.read(path))
    cells: dict[str, str] = {}
    for c in sheet.iter(NS + "c"):
        ref = c.attrib["r"]
        ctype = c.attrib.get("t")
        v = c.find(NS + "v")
        val = None
        if v is not None and v.text is not None:
            val = sst[int(v.text)] if ctype == "s" else v.text
        else:
            inline = c.find(NS + "is")
            if inline is not None:
                val = "".join(x.text or "" for x in inline.iter(NS + "t"))
        if val is not None:
            cells[ref] = val
    return cells


def serial_to_utc_iso(serial: str) -> str:
    ny = EXCEL_EPOCH + dt.timedelta(days=float(serial))
    utc = ny + dt.timedelta(hours=ET_TO_UTC_HOURS)
    return utc.replace(microsecond=0).isoformat() + "Z"


def solve_draw_positions(pairs: list[tuple[str, str]]) -> dict[str, int]:
    """Brute-force the unique team->position map (1..4) whose directed pairings
    reproduce the Article 12.4 chart exactly. Raises if not uniquely solvable."""
    teams = sorted({t for pair in pairs for t in pair})
    if len(teams) != 4:
        raise ValueError(f"expected 4 teams, got {teams}")
    target = sorted(ARTICLE_12_4)
    solutions = []
    for perm in permutations(teams):
        pos = {team: i + 1 for i, team in enumerate(perm)}
        directed = sorted((pos[h], pos[a]) for h, a in pairs)
        if directed == target:
            solutions.append(pos)
    if len(solutions) != 1:
        raise ValueError(f"draw order not uniquely solvable ({len(solutions)} solutions)")
    return solutions[0]


def extract(xlsx_path: str) -> dict:
    z = zipfile.ZipFile(xlsx_path)
    sst = load_shared_strings(z)
    matches = read_sheet(z, "xl/worksheets/sheet2.xml", sst)  # rId2 -> Matches
    setup = read_sheet(z, "xl/worksheets/sheet1.xml", sst)    # rId1 -> Setup

    fixtures = []
    for i in range(GROUP_MATCH_COUNT):
        row = MATCHES_FIRST_ROW + i
        fixtures.append(
            {
                "matchNumber": int(matches[f"B{row}"]),
                "group": matches[f"C{row}"],
                "kickoffUtc": serial_to_utc_iso(matches[f"D{row}"]),
                "home": matches[f"H{row}"].strip(),
                "away": matches[f"M{row}"].strip(),
                "venueRaw": matches[f"Q{row}"].strip(),
            }
        )

    # Candidate draw order solved per group from the pairings above.
    by_group: dict[str, list[tuple[str, str]]] = {}
    for f in fixtures:
        by_group.setdefault(f["group"], []).append((f["home"], f["away"]))
    draw_order = {}
    for group, pairs in sorted(by_group.items()):
        pos = solve_draw_positions(pairs)
        draw_order[group] = {team: p for team, p in sorted(pos.items(), key=lambda kv: kv[1])}

    # Setup-sheet membership/listing order (independent cross-check of draw order).
    setup_rows = []
    for row in range(8, 56):
        name = setup.get(f"B{row}")
        group = setup.get(f"D{row}")
        if name and group:
            setup_rows.append({"name": name.strip(), "group": group.strip()})

    return {
        "fixtures": fixtures,
        "drawOrder": draw_order,
        "setupListing": setup_rows,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--xlsx", required=True, help="path to the source .xlsx (not committed)")
    ap.add_argument("--out", required=True, help="output JSON path")
    args = ap.parse_args()

    data = extract(args.xlsx)

    snapshot = {
        "_provenance": {
            "sourceName": "FIFA World Cup 2026 Interactive Schedule & Automated "
            "Standings (V2.62 Free)",
            "sourceType": "third-party-xlsx",
            "sourceFile": "FIFAWorldCup2026InteractiveScheduleAutomatedStandingsV2.62Free.xlsx",
            "sourceSheet": "Matches + Setup",
            "extractionMethod": "scripts/extract-candidate-schedule.py "
            "(Python stdlib zipfile + xml.etree)",
            "extractedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
            "kickoffSourceTz": "America/New_York",
            "confidence": "medium",
            "disclaimer": [
                "THIRD-PARTY CANDIDATE SOURCE — a fan-made interactive workbook.",
                "NOT official FIFA schedule data.",
                "Extracted for reconciliation / staging only.",
                "NOT used in production; the typed TypeScript candidate layer is "
                "the runtime artifact, and the production resolver never reads it.",
            ],
            "notes": "Kickoff times converted from New York time (ET, EDT=UTC-4 in "
            "June 2026) to UTC. Draw order solved from the Article 12.4 chart.",
        },
        **data,
    }

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(snapshot, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(f"wrote {args.out}: {len(data['fixtures'])} fixtures, "
          f"{len(data['drawOrder'])} groups")
    return 0


if __name__ == "__main__":
    sys.exit(main())
