import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { medicationCheckins, medicationDoses, type MedicationDose } from "@/db/schema";
import { MED_CADENCE_DAYS } from "./constants";
import { addDays, parseISO, todayISO } from "./date";
import type { SideEffectEntry } from "./medication-actions";

export function parseSideEffects(json: string | null | undefined): SideEffectEntry[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((e) => e && typeof e.type === "string")
      .map((e) => ({ type: String(e.type), severity: Number(e.severity) || 0 }));
  } catch {
    return [];
  }
}

/** Recent doses, newest first. */
export async function getDoses(limit = 60): Promise<MedicationDose[]> {
  return db
    .select()
    .from(medicationDoses)
    .orderBy(desc(medicationDoses.date), desc(medicationDoses.id))
    .limit(limit)
    .all();
}

export async function getCheckin(date: string) {
  return (
    (await db.select().from(medicationCheckins).where(eq(medicationCheckins.date, date)).get()) ??
    null
  );
}

export type DoseMarker = { date: string; label: string; drug: string; doseMg: number | null };

/**
 * Points to annotate on the weight chart: the first dose, and every time the
 * drug or dose changes (a titration step). Oldest-first.
 */
export async function getDoseMarkers(): Promise<DoseMarker[]> {
  const doses = await db
    .select()
    .from(medicationDoses)
    .orderBy(medicationDoses.date, medicationDoses.id)
    .all();
  const out: DoseMarker[] = [];
  let prevDrug: string | null = null;
  let prevDose: number | null = null;
  for (const d of doses) {
    if (d.drug !== prevDrug || d.doseMg !== prevDose) {
      out.push({
        date: d.date,
        drug: d.drug,
        doseMg: d.doseMg,
        label: d.doseMg != null ? `${d.doseMg} mg` : "dose",
      });
      prevDrug = d.drug;
      prevDose = d.doseMg;
    }
  }
  return out;
}

const daysBetween = (a: string, b: string) =>
  Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);

export type NextDoseInfo = {
  last: MedicationDose | null;
  dueDate: string | null;
  /** 'none' = nothing logged yet. days = days until due (negative = overdue). */
  status: "none" | "due-today" | "upcoming" | "overdue";
  days: number;
};

/** Weekly-cadence "next dose due" state, relative to `today`. */
export async function getNextDoseInfo(today = todayISO()): Promise<NextDoseInfo> {
  const last = await db
    .select()
    .from(medicationDoses)
    .orderBy(desc(medicationDoses.date), desc(medicationDoses.id))
    .limit(1)
    .get();
  if (!last) return { last: null, dueDate: null, status: "none", days: 0 };
  const dueDate = addDays(last.date, MED_CADENCE_DAYS);
  const days = daysBetween(today, dueDate);
  const status = days === 0 ? "due-today" : days > 0 ? "upcoming" : "overdue";
  return { last: last ?? null, dueDate, status, days };
}
