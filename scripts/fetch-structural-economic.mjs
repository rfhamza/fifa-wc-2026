#!/usr/bin/env node
// @ts-nocheck
/**
 * Phase 1.12 - DEV-ONLY structural/economic fetcher (World Bank WDI).
 * ==================================================================
 * Reproduces data/model-inputs/snapshots/structural-economic-2024.ts from the
 * World Bank World Development Indicators API. This is a DEVELOPMENT helper only:
 * it is NEVER imported by the app, adds NO runtime dependency, and uses only the
 * Node built-in fetch (Node >= 18). Run manually:
 *
 *     node scripts/fetch-structural-economic.mjs
 *
 * Three approved indicators only (no urban/rural, gender, schooling, human
 * capital, unemployment, climate or infrastructure series):
 *   - NY.GDP.MKTP.CD  GDP (current US$)
 *   - NY.GDP.PCAP.CD  GDP per capita (current US$)
 *   - SP.POP.TOTL     Population, total
 *
 * Equivalent REST query (per indicator, all 46 codes at once):
 *   https://api.worldbank.org/v2/country/{CODES}/indicator/{IND}
 *     ?date=2022:2024&format=json&per_page=20000
 * where {CODES} is the ';'-joined WB_CODES below. The script keeps the latest
 * available value with year <= 2024 PER indicator PER economy (2024 preferred;
 * 2025 deliberately ignored), and stores per-indicator years so a row never
 * implies a single shared data year.
 *
 * FALLBACK: if the World Bank host is not reachable (e.g. blocked by a network
 * egress allowlist), this script exits non-zero with guidance to supply a World
 * Bank DataBank export (xlsx/csv) instead of hand-transcribing values. The
 * committed snapshot in this repo was built from such a supplied DataBank export
 * (P_Data_Extract_From_World_Development_Indicators.xlsx); see
 * docs/STRUCTURAL_ECONOMIC_SNAPSHOT_AUDIT.md.
 *
 * England + Scotland are intentionally EXCLUDED here: they are UK constituent FAs
 * with no separate World Bank economy and are NOT parent-mapped to the UK. Their
 * snapshot rows stay hand-authored (mappingStatus "manual").
 */

const BASE_YEAR = 2024;
const INDICATORS = {
  gdp: "NY.GDP.MKTP.CD",
  gdpPerCapita: "NY.GDP.PCAP.CD",
  population: "SP.POP.TOTL",
};

// 46 World Bank economy codes -> app team ids (England/Scotland excluded: manual).
const WB_CODES = {
  MEX: "mexico", KOR: "south-korea", ZAF: "south-africa", CZE: "czechia",
  CAN: "canada", CHE: "switzerland", QAT: "qatar", BIH: "bosnia-herzegovina",
  BRA: "brazil", MAR: "morocco", HTI: "haiti", USA: "usa", AUS: "australia",
  PRY: "paraguay", TUR: "turkiye", DEU: "germany", ECU: "ecuador",
  CIV: "ivory-coast", CUW: "curacao", NLD: "netherlands", JPN: "japan",
  TUN: "tunisia", SWE: "sweden", BEL: "belgium", IRN: "iran", EGY: "egypt",
  NZL: "new-zealand", ESP: "spain", URY: "uruguay", SAU: "saudi-arabia",
  CPV: "cape-verde", FRA: "france", SEN: "senegal", NOR: "norway", IRQ: "iraq",
  ARG: "argentina", AUT: "austria", DZA: "algeria", JOR: "jordan",
  PRT: "portugal", COL: "colombia", UZB: "uzbekistan", COD: "congo-dr",
  HRV: "croatia", PAN: "panama", GHA: "ghana",
};

const codes = Object.keys(WB_CODES).join(";");

async function fetchIndicator(indicator) {
  const url =
    `https://api.worldbank.org/v2/country/${codes}/indicator/${indicator}` +
    `?date=2022:${BASE_YEAR}&format=json&per_page=20000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${indicator}`);
  const json = await res.json();
  const rows = Array.isArray(json) ? json[1] : null;
  if (!rows) throw new Error(`Unexpected payload for ${indicator}`);
  // Keep the latest year <= BASE_YEAR with a numeric value, per economy.
  const best = {};
  for (const r of rows) {
    const code = r.countryiso3code;
    const year = Number(r.date);
    if (!WB_CODES[code] || r.value == null || year > BASE_YEAR) continue;
    if (!best[code] || year > best[code].year) {
      best[code] = { year, value: Number(r.value), name: r.country?.value };
    }
  }
  return best;
}

async function main() {
  let gdp, pc, pop;
  try {
    [gdp, pc, pop] = await Promise.all([
      fetchIndicator(INDICATORS.gdp),
      fetchIndicator(INDICATORS.gdpPerCapita),
      fetchIndicator(INDICATORS.population),
    ]);
  } catch (err) {
    console.error("\nWorld Bank API unreachable:", err.message);
    console.error(
      "FALLBACK: supply a World Bank DataBank export (xlsx/csv) for the three\n" +
        "approved indicators across the 46 codes and rebuild the snapshot from it\n" +
        "(do NOT hand-transcribe). See docs/STRUCTURAL_ECONOMIC_SNAPSHOT_AUDIT.md.",
    );
    process.exit(1);
  }

  const out = [];
  for (const [code, teamId] of Object.entries(WB_CODES)) {
    const g = gdp[code], p = pc[code], n = pop[code];
    if (!g || !p || !n) {
      console.error(`Missing indicator data for ${code} (${teamId})`);
      process.exit(1);
    }
    out.push({
      teamId,
      countryNameRaw: n.name,
      worldBankCountryCode: code,
      gdpCurrentUsd: Math.round(g.value),
      gdpPerCapitaCurrentUsd: Math.round(p.value * 100) / 100,
      population: Math.round(n.value),
      gdpYear: g.year,
      gdpPerCapitaYear: p.year,
      populationYear: n.year,
      mappingStatus: "source-backed",
    });
  }
  out.sort((a, b) => a.teamId.localeCompare(b.teamId));
  // Emit the source-backed rows as TS object literals (append manual
  // England/Scotland rows by hand; see the committed snapshot).
  for (const r of out) {
    console.log(
      `  { teamId: "${r.teamId}", countryNameRaw: "${r.countryNameRaw}", ` +
        `worldBankCountryCode: "${r.worldBankCountryCode}", gdpCurrentUsd: ${r.gdpCurrentUsd}, ` +
        `gdpPerCapitaCurrentUsd: ${r.gdpPerCapitaCurrentUsd}, population: ${r.population}, ` +
        `gdpYear: ${r.gdpYear}, gdpPerCapitaYear: ${r.gdpPerCapitaYear}, ` +
        `populationYear: ${r.populationYear}, mappingStatus: "source-backed" },`,
    );
  }
  console.error(`\nOK: ${out.length} source-backed rows (England/Scotland stay manual).`);
}

main();
