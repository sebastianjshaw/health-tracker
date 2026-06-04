import "server-only";
import { and, asc, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { cardioSessions } from "@/db/schema";
import type { BloodMarker, BodyMetric } from "@/db/schema";
import {
  EXERCISES,
  EXERCISE_LABELS,
  Exercise,
} from "./constants";
import { parseISO, todayISO } from "./date";
import { ageFrom, bmi, bmiClass } from "./health";
import { getBloodPanels, markerStatus, type BloodPanel } from "./blood-data";
import {
  calorieSeriesRange,
  getBodyMetrics,
  getLiftProgression,
  getWeightSeries,
} from "./stats-data";
import {
  getGoalWeight,
  getProfile,
  getTargets,
  type Profile,
} from "./settings";

export type MarkerTrend = {
  marker: string;
  unit: string;
  category: string | null;
  first: { value: number; date: string };
  latest: { value: number; date: string };
  status: "low" | "high" | "ok" | "unknown";
};

export type ReportData = {
  generatedOn: string;
  range: { from: string; to: string };
  profile: Profile;
  age: number | null;

  summary: {
    baseline: { weight: number; date: string } | null;
    current: { weight: number; date: string } | null;
    changeKg: number | null;
    changePct: number | null;
    kgPerWeek: number | null;
    goalWeight: number | null;
    toGoalKg: number | null;
    baselineBmi: number | null;
    currentBmi: number | null;
    baselineBmiClass: string;
    currentBmiClass: string;
  };

  weightSeries: { date: string; weight: number; bodyFat: number | null }[];

  vitals: {
    latestWaist: { value: number; date: string } | null;
    baselineWaist: { value: number; date: string } | null;
    latestBodyFat: { value: number; date: string } | null;
    latestRestingHr: { value: number; date: string } | null;
    bp: { systolic: number; diastolic: number; date: string } | null;
    inRange: BodyMetric[];
  };

  labs: { panels: BloodPanel[]; trends: MarkerTrend[] };

  nutrition: {
    avgKcal: number | null;
    avgProtein: number | null;
    daysLogged: number;
    daysInRange: number;
    targetKcal: number;
    targetProtein: number;
  };

  activity: {
    cardio: {
      total: number;
      perWeek: number;
      byType: { type: string; count: number; totalMin: number; totalKm: number }[];
    };
    lifts: { exercise: Exercise; label: string; first: number; latest: number }[];
  };
};

function latestWith(
  metrics: BodyMetric[], // newest-first
  pick: (m: BodyMetric) => number | null | undefined,
): { value: number; date: string } | null {
  for (const m of metrics) {
    const v = pick(m);
    if (v != null) return { value: v, date: m.date };
  }
  return null;
}

function earliestWith(
  metricsNewestFirst: BodyMetric[],
  pick: (m: BodyMetric) => number | null | undefined,
): { value: number; date: string } | null {
  for (let i = metricsNewestFirst.length - 1; i >= 0; i--) {
    const m = metricsNewestFirst[i];
    const v = pick(m);
    if (v != null) return { value: v, date: m.date };
  }
  return null;
}

function bpFromPanels(panels: BloodPanel[]): ReportData["vitals"]["bp"] {
  // panels are newest-first; find the most recent with both systolic + diastolic
  for (const p of panels) {
    const sys = p.markers.find((m) => /systolic/i.test(m.marker));
    const dia = p.markers.find((m) => /diastolic/i.test(m.marker));
    if (sys && dia) {
      return { systolic: sys.value, diastolic: dia.value, date: p.date };
    }
  }
  return null;
}

function buildTrends(panels: BloodPanel[]): MarkerTrend[] {
  // oldest-first so first = earliest, latest = most recent
  const ordered = [...panels].sort((a, b) => a.date.localeCompare(b.date));
  const map = new Map<string, { first: BloodMarker; latest: BloodMarker }>();
  for (const p of ordered) {
    for (const m of p.markers) {
      const key = m.marker.toLowerCase();
      const cur = map.get(key);
      if (!cur) map.set(key, { first: m, latest: m });
      else map.set(key, { first: cur.first, latest: m });
    }
  }
  const trends: MarkerTrend[] = [];
  for (const { first, latest } of map.values()) {
    if (first.date === latest.date) continue; // measured only once
    trends.push({
      marker: latest.marker,
      unit: latest.unit,
      category: latest.category,
      first: { value: first.value, date: first.date },
      latest: { value: latest.value, date: latest.date },
      status: markerStatus(latest),
    });
  }
  return trends.sort((a, b) => (a.category ?? "").localeCompare(b.category ?? ""));
}

export async function getReportData(from: string, to: string): Promise<ReportData> {
  const [profile, targets, goalWeight, weights, allBody, panels, calorie, lifts, cardio] =
    await Promise.all([
      getProfile(),
      getTargets(),
      getGoalWeight(),
      getWeightSeries(), // all-time, ascending
      getBodyMetrics(), // all-time, newest-first
      getBloodPanels(), // newest-first
      calorieSeriesRange(from, to),
      getLiftProgression(),
      db
        .select()
        .from(cardioSessions)
        .where(and(gte(cardioSessions.date, from), lte(cardioSessions.date, to)))
        .orderBy(asc(cardioSessions.date))
        .all(),
    ]);

  // ---- summary (all-time baseline → current) ----
  const baseline = weights[0] ? { weight: weights[0].weight, date: weights[0].date } : null;
  const last = weights[weights.length - 1];
  const current = last ? { weight: last.weight, date: last.date } : null;

  let changeKg: number | null = null;
  let changePct: number | null = null;
  let kgPerWeek: number | null = null;
  if (baseline && current) {
    changeKg = Math.round((current.weight - baseline.weight) * 10) / 10;
    changePct = baseline.weight
      ? Math.round((changeKg / baseline.weight) * 1000) / 10
      : null;
    const weeks =
      (parseISO(current.date).getTime() - parseISO(baseline.date).getTime()) /
      (7 * 86400000);
    kgPerWeek = weeks > 0 ? Math.round((changeKg / weeks) * 100) / 100 : null;
  }

  const baselineBmi = baseline ? bmi(baseline.weight, profile.heightCm) : null;
  const currentBmi = current ? bmi(current.weight, profile.heightCm) : null;

  // ---- nutrition (range) ----
  const logged = calorie.filter((c) => c.kcal > 0);
  const avgKcal = logged.length
    ? Math.round(logged.reduce((s, c) => s + c.kcal, 0) / logged.length)
    : null;
  const avgProtein = logged.length
    ? Math.round(logged.reduce((s, c) => s + c.protein, 0) / logged.length)
    : null;

  // ---- activity (cardio in range) ----
  const byTypeMap = new Map<string, { count: number; totalMin: number; totalKm: number }>();
  for (const c of cardio) {
    const t = byTypeMap.get(c.type) ?? { count: 0, totalMin: 0, totalKm: 0 };
    t.count += 1;
    t.totalMin += c.durationMin ?? 0;
    t.totalKm += c.distanceKm ?? 0;
    byTypeMap.set(c.type, t);
  }
  const daysInRange = calorie.length || 1;
  const weeksInRange = Math.max(1, daysInRange / 7);

  const liftsOut = EXERCISES.map((ex) => {
    const withEx = lifts.filter((p) => p[ex] != null);
    if (withEx.length === 0) return null;
    return {
      exercise: ex,
      label: EXERCISE_LABELS[ex],
      first: withEx[0][ex] as number,
      latest: withEx[withEx.length - 1][ex] as number,
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  return {
    generatedOn: todayISO(),
    range: { from, to },
    profile,
    age: ageFrom(profile.dob),
    summary: {
      baseline,
      current,
      changeKg,
      changePct,
      kgPerWeek,
      goalWeight,
      toGoalKg:
        current && goalWeight != null
          ? Math.round((current.weight - goalWeight) * 10) / 10
          : null,
      baselineBmi,
      currentBmi,
      baselineBmiClass: bmiClass(baselineBmi),
      currentBmiClass: bmiClass(currentBmi),
    },
    weightSeries: weights,
    vitals: {
      latestWaist: latestWith(allBody, (m) => m.waistCm),
      baselineWaist: earliestWith(allBody, (m) => m.waistCm),
      latestBodyFat: latestWith(allBody, (m) => m.bodyFatPct),
      latestRestingHr: latestWith(allBody, (m) => m.restingHr),
      bp: bpFromPanels(panels),
      inRange: allBody.filter((m) => m.date >= from && m.date <= to),
    },
    labs: { panels, trends: buildTrends(panels) },
    nutrition: {
      avgKcal,
      avgProtein,
      daysLogged: logged.length,
      daysInRange,
      targetKcal: targets.kcal,
      targetProtein: targets.protein,
    },
    activity: {
      cardio: {
        total: cardio.length,
        perWeek: Math.round((cardio.length / weeksInRange) * 10) / 10,
        byType: [...byTypeMap.entries()].map(([type, v]) => ({
          type,
          count: v.count,
          totalMin: Math.round(v.totalMin),
          totalKm: Math.round(v.totalKm * 10) / 10,
        })),
      },
      lifts: liftsOut,
    },
  };
}
