#!/usr/bin/env node
/**
 * Hidden / suspicious Unicode scanner (dev-only, no runtime dependency).
 * ---------------------------------------------------------------------
 * Scans tracked text files for invisible or deceptive characters that can hide
 * content or smuggle intent past review: zero-width characters, bidirectional
 * controls (the "Trojan Source" class), other Cf format controls, the BOM in the
 * middle of a file, TAG characters (U+E0000..U+E007F), NBSP/soft hyphen, and
 * disallowed C0/C1 control characters. Visible characters already consistent with
 * the repo - accented country-name diacritics and regional-indicator flag emoji -
 * are NOT flagged. Flag-emoji TAG sequences are intentionally NOT exempted, so any
 * TAG character is reported.
 *
 * Exit code 0 = clean, 1 = findings (so it can gate CI / pre-PR checks).
 * Usage: node scripts/scan-unicode.mjs
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TEXT_EXT = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "md", "mdx",
  "css", "scss", "html", "yml", "yaml", "txt", "toml", "csv",
]);

/** Codepoints (or ranges) that are suspicious in source/text. */
const SUSPICIOUS = [
  { name: "ZERO WIDTH SPACE", test: (c) => c === 0x200b },
  { name: "ZERO WIDTH NON-JOINER", test: (c) => c === 0x200c },
  { name: "ZERO WIDTH JOINER (bare)", test: (c) => c === 0x200d },
  { name: "WORD JOINER", test: (c) => c === 0x2060 },
  { name: "ZERO WIDTH NO-BREAK SPACE / BOM (mid-file)", test: (c) => c === 0xfeff },
  { name: "LEFT-TO-RIGHT / RIGHT-TO-LEFT MARK", test: (c) => c === 0x200e || c === 0x200f },
  { name: "BIDI EMBEDDING/OVERRIDE", test: (c) => c >= 0x202a && c <= 0x202e },
  { name: "BIDI ISOLATE", test: (c) => c >= 0x2066 && c <= 0x2069 },
  { name: "INVISIBLE OPERATOR", test: (c) => c >= 0x2061 && c <= 0x2064 },
  { name: "INTERLINEAR ANNOTATION", test: (c) => c >= 0xfff9 && c <= 0xfffb },
  { name: "TAG / DEPRECATED FORMAT CHAR", test: (c) => c >= 0xe0000 && c <= 0xe007f },
  { name: "NO-BREAK SPACE", test: (c) => c === 0x00a0 },
  { name: "SOFT HYPHEN", test: (c) => c === 0x00ad },
  { name: "NARROW NO-BREAK / FIGURE SPACE", test: (c) => c === 0x202f || c === 0x2007 },
  { name: "LINE / PARAGRAPH SEPARATOR", test: (c) => c === 0x2028 || c === 0x2029 },
  // C0 controls except TAB (0x09) and LF (0x0a) - so CR (0x0d), VT, FF are flagged.
  { name: "C0 CONTROL (incl. CR)", test: (c) => c < 0x20 && c !== 0x09 && c !== 0x0a },
  { name: "C1 CONTROL", test: (c) => c >= 0x80 && c <= 0x9f },
];

function trackedTextFiles() {
  const out = execSync("git ls-files", { encoding: "utf8" });
  return out
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => {
      const ext = f.split(".").pop()?.toLowerCase() ?? "";
      return TEXT_EXT.has(ext);
    });
}

let findings = 0;
for (const file of trackedTextFiles()) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  let line = 1;
  let col = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (ch === "\n") {
      line += 1;
      col = 0;
      continue;
    }
    col += 1;
    // Allow a BOM only as the very first character of a file.
    if (cp === 0xfeff && line === 1 && col === 1) continue;

    for (const rule of SUSPICIOUS) {
      if (rule.test(cp)) {
        findings += 1;
        console.error(
          `${file}:${line}:${col}  U+${cp.toString(16).toUpperCase().padStart(4, "0")}  ${rule.name}`,
        );
        break;
      }
    }
  }
}

if (findings > 0) {
  console.error(`\nUnicode scan: ${findings} suspicious character(s) found.`);
  process.exit(1);
}
console.log("Unicode scan: clean (no hidden/suspicious characters).");
