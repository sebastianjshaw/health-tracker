"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bloodMarkers } from "@/db/schema";
import { isValidISO } from "./date";

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
): Promise<void> {
  if (!isValidISO(input.date) || !input.marker.trim()) return;
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
  revalidatePath("/stats");
}

/** Bulk-add a full panel for one dated test (used for importing clinic results). */
export async function addBloodPanel(input: {
  date: string;
  clinic?: string | null;
  markers: MarkerInput[];
}): Promise<void> {
  if (!isValidISO(input.date) || input.markers.length === 0) return;
  await db.insert(bloodMarkers).values(
    input.markers
      .filter((m) => m.marker.trim() !== "")
      .map((m) => ({
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
  revalidatePath("/stats");
}

export async function deleteBloodMarker(id: number): Promise<void> {
  await db.delete(bloodMarkers).where(eq(bloodMarkers.id, id));
  revalidatePath("/stats");
}
