/**
 * Import official half-marathon results (entered from race-timing pages) as the
 * authoritative record for each race: the name, a description that identifies it
 * as a half marathon + location, the certified distance/chip time, and the timing
 * -mat splits. Dry-run by default — pass --apply to write.
 *
 *   # preview against prod (read-only)
 *   node --env-file=.env.local --import tsx scripts/import-races.ts
 *   # apply
 *   node --env-file=.env.local --import tsx scripts/import-races.ts --apply
 *
 * Per race we SUPERSEDE the lower-fidelity copies of the same run — the long
 * (≥100 min) mfp/google-health rows on that date — while leaving short warm-up /
 * cool-down walks alone, and absorbing any HR they carried. The 2022 Varvet is
 * already a rich Strava row (GPS + HR): that one is ENRICHED in place (name +
 * splits) rather than replaced, so its GPS track survives.
 *
 * Idempotent: source='race' rows upsert on (source, externalId = slug). Run AFTER
 * import-strava (which also sets `name`); this script has the final say on the
 * dates it owns. Standalone client so it runs cleanly under tsx.
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { estimateCardioKcal } from "../lib/cardio-calories";

const { cardioSessions } = schema;
const SOURCE = "race";
const APPLY = process.argv.includes("--apply");

const url = process.env.DATABASE_URL ?? "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const isRemote = url.startsWith("libsql://") || url.startsWith("http");
const client = createClient(isRemote ? { url, authToken } : { url });
const db = drizzle(client, { schema });

/** "HH:MM:SS" or "MM:SS" → seconds. */
const t = (s: string): number => s.split(":").reduce((a, b) => a * 60 + Number(b), 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

type SplitInput = { label: string; cum: string; split: string; pace: string; kmh?: number };
type Race = {
  slug: string;
  date: string;
  name: string;
  city: string;
  distanceKm: number;
  netTime: string; // chip/net finish
  description: string;
  splits: SplitInput[];
  /** Existing rich Strava row to enrich in place instead of inserting a new row. */
  enrichStravaId?: string;
};

const HM = "Half marathon";

const RACES: Race[] = [
  {
    slug: "gvarvet-2017",
    date: "2017-05-20",
    name: "Göteborgsvarvet 2017",
    city: "Gothenburg, Sweden",
    distanceKm: 21.097,
    netTime: "02:34:57",
    description: `${HM} · Gothenburg, Sweden. Official chip time 02:34:57, 26474/39342 overall. Bib 31033. Club AKQA.`,
    splits: [
      { label: "5 km", cum: "00:37:27", split: "37:27", pace: "07:30", kmh: 8.01 },
      { label: "10 km", cum: "01:15:09", split: "37:42", pace: "07:33", kmh: 7.96 },
      { label: "15 km", cum: "01:51:44", split: "36:35", pace: "07:19", kmh: 8.2 },
      { label: "20 km", cum: "02:29:10", split: "37:26", pace: "07:30", kmh: 8.01 },
      { label: "Finish", cum: "02:34:57", split: "05:47", pace: "05:17", kmh: 11.37 },
    ],
  },
  {
    slug: "gvarvet-2018",
    date: "2018-05-19",
    name: "Göteborgsvarvet 2018",
    city: "Gothenburg, Sweden",
    distanceKm: 21.097,
    netTime: "02:48:05",
    description: `${HM} · Gothenburg, Sweden. Official chip time 02:48:05, 25448/38216 overall. Bib 43819.`,
    splits: [
      { label: "5 km", cum: "00:40:34", split: "40:34", pace: "08:07", kmh: 7.4 },
      { label: "10 km", cum: "01:21:15", split: "40:41", pace: "08:09", kmh: 7.37 },
      { label: "15 km", cum: "02:01:09", split: "39:54", pace: "07:59", kmh: 7.52 },
      { label: "20 km", cum: "02:41:43", split: "40:34", pace: "08:07", kmh: 7.4 },
      { label: "Finish", cum: "02:48:05", split: "06:22", pace: "05:49", kmh: 10.32 },
    ],
  },
  {
    slug: "gvarvet-2019",
    date: "2019-05-18",
    name: "Göteborgsvarvet 2019",
    city: "Gothenburg, Sweden",
    distanceKm: 21.097,
    netTime: "02:21:48",
    description: `${HM} · Gothenburg, Sweden. Official chip time 02:21:48, 21461/30466 overall. Bib 20149. Club AKQA Sweden.`,
    splits: [
      { label: "5 km", cum: "00:31:00", split: "31:00", pace: "06:12", kmh: 9.68 },
      { label: "10 km", cum: "01:05:30", split: "34:30", pace: "06:54", kmh: 8.7 },
      { label: "15 km", cum: "01:40:35", split: "35:05", pace: "07:01", kmh: 8.55 },
      { label: "20 km", cum: "02:14:43", split: "34:08", pace: "06:50", kmh: 8.79 },
      { label: "Finish", cum: "02:21:48", split: "07:05", pace: "06:28", kmh: 9.29 },
    ],
  },
  {
    slug: "cph-half-2019",
    date: "2019-09-15",
    name: "Copenhagen Half Marathon 2019",
    city: "Copenhagen, Denmark",
    distanceKm: 21.097,
    netTime: "01:58:49",
    description: `${HM} · Copenhagen, Denmark. Net time 01:58:49 (gross 02:27:46), 13229/23043 overall, 1378/1842 in M35–39. Bib 20556.`,
    splits: [
      { label: "5 km", cum: "28:07", split: "28:07", pace: "05:38" },
      { label: "10 km", cum: "56:06", split: "28:00", pace: "05:36" },
      { label: "15 km", cum: "01:24:10", split: "28:04", pace: "05:37" },
      { label: "20 km", cum: "01:53:05", split: "28:56", pace: "05:48" },
      { label: "Finish", cum: "01:58:49", split: "05:44", pace: "05:14" },
    ],
  },
  {
    slug: "gvarvet-2022",
    date: "2022-05-21",
    name: "Göteborgsvarvet 2022",
    city: "Gothenburg, Sweden",
    distanceKm: 21.522, // keep the Strava GPS-measured distance on the enriched row
    netTime: "02:21:06",
    description: `${HM} · Gothenburg, Sweden. Official chip time 02:21:06, 13373/18945 overall. Bib 22674. Club AKQA Sweden.`,
    splits: [
      { label: "5 km", cum: "00:32:27", split: "32:27", pace: "06:30", kmh: 9.25 },
      { label: "10 km", cum: "01:06:08", split: "33:41", pace: "06:45", kmh: 8.91 },
      { label: "15 km", cum: "01:39:40", split: "33:32", pace: "06:43", kmh: 8.94 },
      { label: "20 km", cum: "02:14:15", split: "34:35", pace: "06:55", kmh: 8.68 },
      { label: "Finish", cum: "02:21:06", split: "06:51", pace: "06:15", kmh: 9.6 },
    ],
    enrichStravaId: "7179451680",
  },
];

function buildSplits(rows: SplitInput[]): string {
  return JSON.stringify({
    unit: "metric",
    rows: rows.map((r) => {
      const paceSecPerKm = t(r.pace);
      return {
        label: r.label,
        cumulativeSec: t(r.cum),
        splitSec: t(r.split),
        paceSecPerKm,
        kmh: r.kmh ?? (paceSecPerKm ? round2(3600 / paceSecPerKm) : null),
      };
    }),
  });
}

async function nearestWeight(date: string): Promise<number | null> {
  const r = await db
    .select({ w: schema.bodyMetrics.weightKg })
    .from(schema.bodyMetrics)
    .where(sql`${schema.bodyMetrics.weightKg} is not null`)
    .orderBy(sql`abs(julianday(${schema.bodyMetrics.date}) - julianday(${date}))`)
    .limit(1)
    .get();
  return r?.w ?? null;
}

async function main() {
  console.log(`DB:   ${isRemote ? url.replace(/(libsql:\/\/[^.]+).*/, "$1…(remote)") : url}`);
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (read-only)"}\n`);

  const upserts: Array<() => Promise<void>> = [];
  let supersedeTotal = 0;

  for (const race of RACES) {
    const durationMin = round2(t(race.netTime) / 60);
    const splits = buildSplits(race.splits);

    if (race.enrichStravaId) {
      // 2022: enrich the existing Strava row in place (keep GPS/HR/elevation).
      console.log(`${race.date} ${race.name}: ENRICH strava ${race.enrichStravaId} (name + splits + description)`);
      upserts.push(async () => {
        await db
          .update(cardioSessions)
          .set({ name: race.name, splits, notes: race.description })
          .where(and(eq(cardioSessions.source, "strava"), eq(cardioSessions.externalId, race.enrichStravaId!)));
      });
      continue;
    }

    // Candidates to supersede: long (≥100 min) mfp/google-health rows on the date.
    // Short warm-up/cool-down walks are left untouched (and their HR absorbed).
    const onDate = await db
      .select({
        id: cardioSessions.id,
        source: cardioSessions.source,
        type: cardioSessions.type,
        durationMin: cardioSessions.durationMin,
        kcal: cardioSessions.kcal,
        avgHr: cardioSessions.avgHr,
        maxHr: cardioSessions.maxHr,
      })
      .from(cardioSessions)
      .where(and(eq(cardioSessions.date, race.date), inArray(cardioSessions.source, ["mfp", "google-health"])))
      .all();
    const toSupersede = onDate.filter((r) => (r.durationMin ?? 0) >= 100 && (r.type === "run" || r.type === "other"));

    const absorbedAvgHr = Math.max(0, ...toSupersede.map((r) => r.avgHr ?? 0)) || null;
    const absorbedMaxHr = Math.max(0, ...toSupersede.map((r) => r.maxHr ?? 0)) || null;
    const absorbedKcal = Math.max(0, ...toSupersede.map((r) => (r.kcal && r.kcal >= 1500 ? r.kcal : 0))) || null;
    const weight = await nearestWeight(race.date);
    const kcal = absorbedKcal ?? estimateCardioKcal("run", durationMin, weight);
    supersedeTotal += toSupersede.length;

    console.log(
      `${race.date} ${race.name}: insert race row ` +
        `(${race.distanceKm} km, ${race.netTime}, ${kcal} kcal${absorbedAvgHr ? `, HR ${absorbedAvgHr}` : ""}) ` +
        `| supersede ${toSupersede.length} [${toSupersede.map((r) => `${r.source}:${r.type}/${r.durationMin}m`).join(", ")}]`,
    );

    upserts.push(async () => {
      if (toSupersede.length) {
        await db.delete(cardioSessions).where(inArray(cardioSessions.id, toSupersede.map((r) => r.id)));
      }
      await db
        .insert(cardioSessions)
        .values({
          date: race.date,
          type: "run",
          durationMin,
          distanceKm: race.distanceKm,
          avgHr: absorbedAvgHr,
          maxHr: absorbedMaxHr,
          kcal,
          name: race.name,
          notes: race.description,
          splits,
          startedAt: null,
          source: SOURCE,
          externalId: race.slug,
        })
        .onConflictDoUpdate({
          target: [cardioSessions.source, cardioSessions.externalId],
          set: {
            date: race.date,
            type: "run",
            durationMin,
            distanceKm: race.distanceKm,
            avgHr: absorbedAvgHr,
            maxHr: absorbedMaxHr,
            kcal,
            name: race.name,
            notes: race.description,
            splits,
          },
        });
    });
  }

  console.log(`\n${RACES.length} races; supersede ${supersedeTotal} lower-fidelity rows.`);
  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to write.");
    return;
  }
  for (const run of upserts) await run();
  console.log(`\nAPPLIED: ${RACES.length} races written, ${supersedeTotal} superseded rows removed.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
