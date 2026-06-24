/**
 * Minimal, dependency-free reader for the one MFP "Data Access Request" sheet.
 * Parses the two OOXML members (sharedStrings + the worksheet) into records
 * keyed by the export's header names. Pure (strings in → objects out) so it can
 * be unit-tested; the script shells out to `unzip -p` to obtain the XML.
 *
 * The export is a single sheet: row 1 is a title, row 2 is the header, data
 * starts at row 3. Column A is a blank row-index column.
 */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXml(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[body] ?? m;
  });
}

/** All `<t>…</t>` text inside a chunk, concatenated and entity-decoded. */
function textOf(chunk: string): string {
  let out = "";
  for (const m of chunk.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeXml(out);
}

export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) out.push(textOf(m[1]));
  return out;
}

/** "AO8050" → 0-based column index (AO → 40). */
function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Parse one worksheet into an array of cell-value arrays (one per row). */
function parseRows(sheetXml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rm of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cm of rm[1].matchAll(/<c\s+r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const idx = colIndex(cm[1]);
      const attrs = cm[2];
      const inner = cm[3];
      const t = attrs.match(/\bt="([^"]+)"/)?.[1];
      let val = "";
      if (t === "s") {
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        val = v != null ? (shared[Number(v)] ?? "") : "";
      } else if (t === "inlineStr") {
        val = textOf(inner);
      } else {
        val = decodeXml(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
      }
      cells[idx] = val;
    }
    // normalise holes to empty strings up to the populated width
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
    rows.push(cells);
  }
  return rows;
}

export type MfpRecord = Record<string, string>;

/**
 * Parse the workbook into header-keyed records. Row 1 is the title; row 2 is the
 * header; rows 3+ are data. Returns { header, records }.
 */
export function parseWorkbook(
  sharedStringsXml: string,
  sheetXml: string,
): { header: string[]; records: MfpRecord[] } {
  const shared = parseSharedStrings(sharedStringsXml);
  const rows = parseRows(sheetXml, shared);
  if (rows.length < 2) return { header: [], records: [] };
  const header = rows[1]; // row 2 (0-based index 1)
  const records: MfpRecord[] = [];
  for (let r = 2; r < rows.length; r++) {
    const cells = rows[r];
    const rec: MfpRecord = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c];
      if (key) rec[key] = cells[c] ?? "";
    }
    records.push(rec);
  }
  return { header, records };
}

/** Map an MFP meal name onto our four-meal model. */
export function mapMeal(mfpMeal: string | undefined): "breakfast" | "lunch" | "dinner" | "snacks" {
  switch ((mfpMeal ?? "").trim().toLowerCase()) {
    case "breakfast":
      return "breakfast";
    case "lunch":
      return "lunch";
    case "dinner":
      return "dinner";
    default:
      return "snacks"; // Snacks, "Daily Food", or anything unrecognised
  }
}

/** Classify an MFP cardio description into our cardio types. */
export function mapCardioType(
  desc: string,
): "run" | "bike" | "walk" | "row" | "swim" | "other" {
  const d = desc.toLowerCase();
  if (/(run|jog)/.test(d)) return "run";
  if (/(cycl|bike|bicycl)/.test(d)) return "bike";
  if (/walk/.test(d)) return "walk";
  if (/row/.test(d)) return "row";
  if (/swim/.test(d)) return "swim";
  return "other";
}

/** Number or null (blank / non-numeric → null). */
export function num(v: string | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
