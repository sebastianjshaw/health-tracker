/**
 * Promote clean program workouts hiding in the free-form MFP strength history
 * into the 5×5 log (lift_sessions + lift_sets), and remove the now-redundant
 * freeform rows. Dry-run by default — pass --apply to write.
 *
 *   node --env-file=.env.local --import tsx scripts/extrapolate-lifts.ts
 *   node --env-file=.env.local --import tsx scripts/extrapolate-lifts.ts --apply
 *
 * Only days that unambiguously match a StrongLifts workout are promoted. Today
 * that's two Workout B days (Squat 5×5 + OHP 5×5 + Deadlift 1×5); everything else
 * in freeform is warm-up ramps / accessories that don't map to a clean A/B.
 *
 * Idempotent: skips a date that already has a lift_session for that workout, and
 * reads the (already lb→kg-corrected) weight straight from freeform, so it must
 * run AFTER import-mfp. import-mfp in turn skips freeform on promoted dates, so
 * a re-import won't reintroduce these rows.
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../db/schema";

const { freeformLifts, liftSessions, liftSets } = schema;
const APPLY = process.argv.includes("--apply");

const url = process.env.DATABASE_URL ?? "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const isRemote = url.startsWith("libsql://") || url.startsWith("http");
const db = drizzle(createClient(isRemote ? { url, authToken } : { url }), { schema });

// Map MFP free-form exercise names onto the program's five lifts.
const ALIASES: Record<string, "squat" | "bench" | "row" | "ohp" | "deadlift"> = {
  Squat: "squat",
  "Bench Press, Barbell": "bench",
  "Bench Press, Dumbell": "bench",
  "Barbell Row, Bent-over": "row",
  "Dumbbell Row, One-Arm, Bent-Over": "row",
  "Overhead Press, Barbell": "ohp",
  "Barbell Military Press": "ohp",
  "Shoulder Press": "ohp",
  "Deadlift, Straight Leg": "deadlift",
};

// Days confirmed (by review) to be a clean program workout.
const PROMOTE: Array<{ date: string; workout: "A" | "B" }> = [
  { date: "2018-12-22", workout: "B" },
  { date: "2019-11-28", workout: "B" },
];

async function main() {
  console.log(`DB:   ${isRemote ? url.replace(/(libsql:\/\/[^.]+).*/, "$1…(remote)") : url}`);
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (read-only)"}\n`);

  const actions: Array<() => Promise<void>> = [];
  for (const { date, workout } of PROMOTE) {
    const existing = await db
      .select({ id: liftSessions.id })
      .from(liftSessions)
      .where(and(eq(liftSessions.date, date), eq(liftSessions.workout, workout)))
      .get();
    if (existing) {
      console.log(`${date} Workout ${workout}: already in 5×5 log — skip.`);
      continue;
    }

    const rows = await db.select().from(freeformLifts).where(eq(freeformLifts.date, date)).all();
    const entries: Array<{ exercise: string; targetWeightKg: number; reps: number[]; ffId: number }> = [];
    let unmapped = 0;
    for (const r of rows) {
      const ex = ALIASES[r.exercise];
      if (!ex || r.weightKg == null || !r.sets || !r.repsPerSet) {
        unmapped++;
        continue;
      }
      entries.push({ exercise: ex, targetWeightKg: r.weightKg, reps: Array(r.sets).fill(r.repsPerSet), ffId: r.id });
    }
    const summary = entries.map((e) => `${e.exercise} ${e.reps.length}×${e.reps[0]}@${e.targetWeightKg}kg`).join(", ");
    console.log(`${date} Workout ${workout}: ${entries.length} lifts → ${summary}${unmapped ? `  (${unmapped} unmapped left as freeform)` : ""}`);

    actions.push(async () => {
      const [session] = await db.insert(liftSessions).values({ date, workout }).returning();
      await db.insert(liftSets).values(
        entries.flatMap((e) =>
          e.reps.map((reps, i) => ({
            sessionId: session.id,
            exercise: e.exercise,
            targetWeightKg: e.targetWeightKg,
            setNumber: i + 1,
            repsDone: reps,
          })),
        ),
      );
      const ids = entries.map((e) => e.ffId);
      if (ids.length) await db.delete(freeformLifts).where(inArray(freeformLifts.id, ids));
    });
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to write.");
    return;
  }
  for (const run of actions) await run();
  console.log(`\nAPPLIED: promoted ${actions.length} workout(s) to the 5×5 log.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
