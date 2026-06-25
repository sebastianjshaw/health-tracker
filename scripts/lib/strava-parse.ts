/**
 * Parser for a Strava bulk-export `activities.csv`. Two wrinkles drive the design:
 *  - description / notes fields contain embedded commas, quotes and NEWLINES, so
 *    we need a real RFC-4180 reader, not a line/split.
 *  - the export has DUPLICATE header names ("Distance", "Elapsed Time", "Max
 *    Heart Rate" each appear twice — a summary copy and a detailed copy). We
 *    resolve a field to the last non-empty occurrence, which is the detailed one.
 *
 * Pure: string in → typed activities out, so it can be exercised without a DB.
 */

/** RFC-4180 CSV → array of string rows (handles quoted commas/newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // strip a leading BOM if present
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/**
 * "Feb 26, 2023, 10:25:23 AM" → { date: "2023-02-26", startedAt: "2023-02-26T10:25" }.
 * Strava writes this column in the athlete's LOCAL time, so we keep it as-is
 * (no timezone shift) to match how the app stores local naive timestamps.
 */
export function parseStravaDate(s: string): { date: string; startedAt: string } | null {
  const m = s.match(/^(\w{3})\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/);
  if (!m) return null;
  const [, mon, d, y, hhRaw, mm, , ap] = m;
  const month = MONTHS[mon];
  if (!month) return null;
  let hh = Number(hhRaw) % 12;
  if (ap === "PM") hh += 12;
  const date = `${y}-${month}-${d.padStart(2, "0")}`;
  const startedAt = `${date}T${String(hh).padStart(2, "0")}:${mm}`;
  return { date, startedAt };
}

const numOrNull = (v: string | undefined): number | null => {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Map a Strava "Activity Type" onto our cardio types. */
export function mapStravaType(t: string): "run" | "bike" | "walk" | "row" | "swim" | "other" {
  const d = t.toLowerCase();
  if (/run/.test(d)) return "run";
  if (/(ride|cycl|bike|virtualride|ebike)/.test(d)) return "bike";
  if (/walk|hike/.test(d)) return "walk";
  if (/row/.test(d)) return "row";
  if (/swim/.test(d)) return "swim";
  return "other";
}

export type StravaActivity = {
  id: string;
  date: string;
  startedAt: string | null;
  name: string;
  type: "run" | "bike" | "walk" | "row" | "swim" | "other";
  description: string;
  durationMin: number | null; // moving time, minutes (rounded)
  distanceKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  elevationGainM: number | null;
  relativeEffort: number | null;
  kcal: number | null;
  filename: string | null; // GPX path relative to the export root, if any
};

/**
 * Resolve each activity from the export. For duplicated headers we read the LAST
 * non-empty cell under that name (the detailed metric block); for distance that
 * column is in METRES, which we convert to km.
 */
export function parseStravaActivities(csv: string): StravaActivity[] {
  const rows = parseCsv(csv);
  if (rows.length < 2) return [];
  const header = rows[0];

  // header name → list of column indices (duplicates kept in order)
  const cols = new Map<string, number[]>();
  header.forEach((h, i) => {
    const key = h.trim();
    (cols.get(key) ?? cols.set(key, []).get(key)!).push(i);
  });
  const lastNonEmpty = (cells: string[], name: string): string | undefined => {
    const idxs = cols.get(name);
    if (!idxs) return undefined;
    for (let k = idxs.length - 1; k >= 0; k--) {
      const v = cells[idxs[k]];
      if (v != null && v.trim() !== "") return v;
    }
    return undefined;
  };
  const first = (cells: string[], name: string): string | undefined => {
    const idxs = cols.get(name);
    return idxs ? cells[idxs[0]] : undefined;
  };

  const out: StravaActivity[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const id = (first(cells, "Activity ID") ?? "").trim();
    if (!id) continue;
    const when = parseStravaDate((first(cells, "Activity Date") ?? "").trim());
    const distM = numOrNull(lastNonEmpty(cells, "Distance"));
    // Prefer moving time; fall back to elapsed (treadmill rows omit moving time).
    const movingSec =
      numOrNull(lastNonEmpty(cells, "Moving Time")) ?? numOrNull(lastNonEmpty(cells, "Elapsed Time"));
    const fname = (first(cells, "Filename") ?? "").trim();
    out.push({
      id,
      date: when?.date ?? "",
      startedAt: when?.startedAt ?? null,
      name: (first(cells, "Activity Name") ?? "").trim(),
      type: mapStravaType((first(cells, "Activity Type") ?? "").trim()),
      description: (first(cells, "Activity Description") ?? "").trim(),
      durationMin: movingSec != null ? Math.round(movingSec / 60) : null,
      distanceKm: distM != null ? Math.round((distM / 1000) * 1000) / 1000 : null,
      avgHr: numOrNull(lastNonEmpty(cells, "Average Heart Rate")),
      maxHr: numOrNull(lastNonEmpty(cells, "Max Heart Rate")),
      elevationGainM: numOrNull(lastNonEmpty(cells, "Elevation Gain")),
      relativeEffort: numOrNull(lastNonEmpty(cells, "Relative Effort")),
      kcal: numOrNull(lastNonEmpty(cells, "Calories")),
      filename: fname || null,
    });
  }
  return out.filter((a) => a.date);
}
