"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bloodMarkers } from "@/db/schema";
import { actionFail, actionOk, type ActionResult } from "./action-result";
import { requireAuth } from "./auth";
import { isValidISO } from "./date";
import { revalidatePaths } from "./revalidate";

export type MarkerInput = {
  marker: string;
  value: number;
  unit?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
  category?: string | null;
};

export async function addBloodMarker(
  input: MarkerInput & { date: string; clinic?: string | null },
): Promise<ActionResult> {
  await requireAuth();
  if (!isValidISO(input.date)) return actionFail("Invalid date");
  if (!input.marker.trim()) return actionFail("Marker name is required");
  await db.insert(bloodMarkers).values({
    date: input.date,
    marker: input.marker.trim(),
    value: input.value,
    unit: input.unit ?? "",
    refLow: input.refLow ?? null,
    refHigh: input.refHigh ?? null,
    category: input.category ?? null,
    clinic: input.clinic ?? null,
  });
  revalidatePaths("/bloodwork", "/report");
  return actionOk();
}

/** Bulk-add a full panel for one dated test (used for importing clinic results). */
export async function addBloodPanel(input: {
  date: string;
  clinic?: string | null;
  markers: MarkerInput[];
}): Promise<ActionResult> {
  await requireAuth();
  if (!isValidISO(input.date)) return actionFail("Invalid date");
  const markers = input.markers.filter((m) => m.marker.trim() !== "");
  if (markers.length === 0) return actionFail("Add at least one marker");
  await db.insert(bloodMarkers).values(
    markers.map((m) => ({
      date: input.date,
      marker: m.marker.trim(),
      value: m.value,
      unit: m.unit ?? "",
      refLow: m.refLow ?? null,
      refHigh: m.refHigh ?? null,
      category: m.category ?? null,
      clinic: input.clinic ?? null,
    })),
  );
  revalidatePaths("/bloodwork", "/report");
  return actionOk();
}

export async function deleteBloodMarker(id: number): Promise<ActionResult> {
  await requireAuth();
  await db.delete(bloodMarkers).where(eq(bloodMarkers.id, id));
  revalidatePaths("/bloodwork", "/report");
  return actionOk();
}
