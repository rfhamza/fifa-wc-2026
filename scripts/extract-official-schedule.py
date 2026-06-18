#!/usr/bin/env python3
"""
Phase 1.6 — dev-only extractor for the OFFICIAL FIFA 2026 match-schedule PDF.

Parses the PDF *text layer* (stdlib only: zlib for FlateDecode streams) and pulls
the group-stage match tuples (match number, group, home code, away code, ET
kickoff). FIFA 3-letter codes are mapped to our team ids. ET kickoffs are
converted to UTC (UTC-4 across the entire 2026 EDT window).

NO runtime dependencies and NO network. The source PDF is NOT committed; pass a
local copy with --pdf. Output is written as a provenance-headed JSON snapshot
(data/official/staging/raw/official-schedule.json) used purely for auditing the
hand-checked transcription in data/official/staging/schedule.ts.

  # Preferred: feed the PDF's extracted text layer (e.g. `pdftotext in.pdf -`):
  pdftotext FWC26_Match_Schedule_v17_10042026_EN.pdf - \
    | python3 scripts/extract-official-schedule.py --text - \
        --out data/official/staging/raw/official-schedule.json

  # Best-effort direct PDF parse (this wallchart stores text in encoded streams
  # that stdlib cannot reliably decode, so --text is preferred):
  python3 scripts/extract-official-schedule.py --pdf in.pdf --out out.json

This wallchart's glyphs live in encoded content streams, so a stdlib-only PDF
decode is unreliable; the supported path is to extract the text layer with the
platform PDF reader and pipe it in via --text. Date and venue are intentionally
NOT derived here: the grid makes them fragile to parse positionally, so they are
transcribed by a reviewer and cross-checked against the candidate layer (see the
audit doc). This script captures the unambiguous text-layer dimensions only.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import zlib

# FIFA 3-letter code -> our team id (matches data/official/teams.ts).
CODE_TO_ID = {
    "MEX": "mexico", "RSA": "south-africa", "KOR": "south-korea", "CZE": "czechia",
    "CAN": "canada", "BIH": "bosnia-herzegovina", "QAT": "qatar", "SUI": "switzerland",
    "BRA": "brazil", "MAR": "morocco", "HAI": "haiti", "SCO": "scotland",
    "USA": "usa", "PAR": "paraguay", "AUS": "australia", "TUR": "turkiye",
    "GER": "germany", "CUW": "curacao", "CIV": "ivory-coast", "ECU": "ecuador",
    "NED": "netherlands", "JPN": "japan", "SWE": "sweden", "TUN": "tunisia",
    "BEL": "belgium", "EGY": "egypt", "IRN": "iran", "NZL": "new-zealand",
    "ESP": "spain", "CPV": "cape-verde", "KSA": "saudi-arabia", "URU": "uruguay",
    "FRA": "france", "SEN": "senegal", "IRQ": "iraq", "NOR": "norway",
    "ARG": "argentina", "ALG": "algeria", "AUT": "austria", "JOR": "jordan",
    "POR": "portugal", "COD": "congo-dr", "UZB": "uzbekistan", "COL": "colombia",
    "ENG": "england", "CRO": "croatia", "GHA": "ghana", "PAN": "panama",
}
GROUPS = set("ABCDEFGHIJKL")


def extract_text(pdf_bytes: bytes) -> str:
    """Return all text drawn by the PDF, FlateDecode streams decompressed."""
    chunks: list[str] = []
    for m in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", pdf_bytes, re.DOTALL):
        raw = m.group(1)
        try:
            data = zlib.decompress(raw)
        except zlib.error:
            data = raw  # already plain text
        text = data.decode("latin-1", errors="ignore")
        # Strings shown by Tj/TJ live inside parentheses; pull them in order.
        for s in re.findall(r"\(((?:[^()\\]|\\.)*)\)", text):
            s = s.replace("\\(", "(").replace("\\)", ")").replace("\\\\", "\\")
            chunks.append(s)
    return "\n".join(chunks)


def parse_matches(text: str) -> list[dict]:
    """Parse group-stage tuples from the (token-ordered) text layer."""
    # Normalise: collapse the per-glyph token stream into a flat token list.
    tokens = [t.strip() for t in re.split(r"\s+", text) if t.strip()]
    flat = " ".join(tokens)

    # Match patterns like "MEXv RSA A 1 15:00" or "NEDv SWEF 35 13:00"
    # (home code + 'v', away code optionally fused with the group letter,
    # optional standalone group, match number, HH:MM).
    pat = re.compile(
        r"\b([A-Z]{3})\s*v\s+([A-Z]{3})([A-L])?\s+([A-L])?\s*(\d{1,3})\s+(\d{2}:\d{2})\b"
    )
    out: dict[int, dict] = {}
    for mo in pat.finditer(flat):
        home, away, g1, g2, num_s, hhmm = mo.groups()
        group = g1 or g2
        num = int(num_s)
        if home not in CODE_TO_ID or away not in CODE_TO_ID:
            continue
        if group not in GROUPS or not (1 <= num <= 72):
            continue
        out[num] = {
            "matchNumber": num,
            "group": group,
            "homeCode": home,
            "awayCode": away,
            "homeTeamId": CODE_TO_ID[home],
            "awayTeamId": CODE_TO_ID[away],
            "kickoffEt": hhmm,
        }
    return [out[n] for n in sorted(out)]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", help="path to the FIFA schedule PDF (not committed)")
    ap.add_argument("--text", help="extracted text layer ('-' for stdin); preferred")
    ap.add_argument("--out", default="data/official/staging/raw/official-schedule.json")
    args = ap.parse_args()

    if args.text:
        if args.text == "-":
            text = sys.stdin.read()
        else:
            with open(args.text, "r", encoding="utf-8", errors="ignore") as fh:
                text = fh.read()
    elif args.pdf:
        with open(args.pdf, "rb") as fh:
            text = extract_text(fh.read())
    else:
        ap.error("provide --text (preferred) or --pdf")

    matches = parse_matches(text)
    snapshot = {
        "_provenance": {
            "sourceName": "FIFA World Cup 2026 Match Schedule",
            "sourceFile": "FWC26_Match_Schedule_v17_10042026_EN.pdf",
            "version": "v17",
            "sourceDate": "2026-04-10",
            "timezone": "America/New_York (ET)",
            "subjectToChange": True,
            "extractionMethod": "scripts/extract-official-schedule.py (PDF text layer, stdlib zlib)",
            "extractedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "statement": (
                "Derived from the OFFICIAL FIFA schedule PDF, transcribed for "
                "verification/staging only. Date and venue are reviewer-transcribed "
                "from the wallchart and cross-checked against the candidate layer. "
                "Not used in production."
            ),
        },
        "groupStageMatchCount": len(matches),
        "matches": matches,
    }
    with open(args.out, "w") as fh:
        json.dump(snapshot, fh, indent=2)
        fh.write("\n")
    print(f"extracted {len(matches)} group-stage matches -> {args.out}", file=sys.stderr)
    return 0 if len(matches) == 72 else 1


if __name__ == "__main__":
    raise SystemExit(main())
