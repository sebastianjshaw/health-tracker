"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { medicationCheckins, medicationDoses } from "@/db/schema";
import { actionFail, actionOk, type ActionResult } from "./action-result";
import { requireAuth } from "./auth";
import { isValidISO } from "./date";
import { isFiniteOrNull } from "./validate";
import { revalidatePaths } from "./revalidate";

const PATHS = ["/", "/medication", "/stats"] as const;

export type DoseInput = {
  date: string;
  time?: string | null;
  drug: string;
  doseMg?: number | null;
  site?: string | null;
  notes?: string | null;
};

export async function logDose(input: DoseInput): Promise<ActionResult> {
  await requireAuth();
  if (!isValidISO(input.date)) return actionFail("Invalid date");
  if (!input.drug.trim()) return actionFail("Drug is required");
  if (!isFiniteOrNull(input.doseMg)) return actionFail("Dose must be a number");
  await db.insert(medicationDoses).values({
    date: input.date,
    time: input.time?.trim() || null,
    drug: input.drug.trim(),
    doseMg: input.doseMg ?? null,
    site: input.site?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  revalidatePaths(...PATHS);
  return actionOk();
}

export type DoseUpdate = DoseInput & { id: number };

export async function updateDose(input: DoseUpdate): Promise<ActionResult> {
  await requireAuth();
  if (!isValidISO(input.date)) return actionFail("Invalid date");
  if (!input.drug.trim()) return actionFail("Drug is required");
  if (!isFiniteOrNull(input.doseMg)) return actionFail("Dose must be a number");
  const existing = await db
    .select({ id: medicationDoses.id })
    .from(medicationDoses)
    .where(eq(medicationDoses.id, input.id))
    .get();
  if (!existing) return actionFail("Dose not found");
  await db
    .update(medicationDoses)
    .set({
      date: input.date,
      time: input.time?.trim() || null,
      drug: input.drug.trim(),
      doseMg: input.doseMg ?? null,
      site: input.site?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .where(eq(medicationDoses.id, input.id));
  revalidatePaths(...PATHS);
  return actionOk();
}

export async function deleteDose(id: number): Promise<ActionResult> {
  await requireAuth();
  await db.delete(medicationDoses).where(eq(medicationDoses.id, id));
  revalidatePaths(...PATHS);
  return actionOk();
}

export type SideEffectEntry = { type: string; severity: number };

export type CheckinInput = {
  date: string;
  appetite?: number | null;
  sideEffects?: SideEffectEntry[];
  notes?: string | null;
};

/** Upsert the daily check-in for a date. An empty check-in deletes the row so
 * the table stays sparse (mirrors day_health). */
export async function setCheckin(input: CheckinInput): Promise<ActionResult> {
  await requireAuth();
  if (!isValidISO(input.date)) return actionFail("Invalid date");
  const appetite =
    input.appetite != null && input.appetite >= 1 && input.appetite <= 5
      ? Math.round(input.appetite)
      : null;
  const effects = (input.sideEffects ?? [])
    .filter((e) => e.type && e.severity > 0)
    .map((e) => ({ type: e.type, severity: Math.max(1, Math.min(3, Math.round(e.severity))) }));
  const notes = input.notes?.trim() || null;

  if (appetite == null && effects.length === 0 && !notes) {
    await db.delete(medicationCheckins).where(eq(medicationCheckins.date, input.date));
    revalidatePaths(...PATHS);
    return actionOk();
  }

  const sideEffects = effects.length ? JSON.stringify(effects) : null;
  await db
    .insert(medicationCheckins)
    .values({ date: input.date, appetite, sideEffects, notes })
    .onConflictDoUpdate({
      target: medicationCheckins.date,
      set: { appetite, sideEffects, notes },
    });
  revalidatePaths(...PATHS);
  return actionOk();
}
