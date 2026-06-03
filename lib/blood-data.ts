import "server-only";
import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { bloodMarkers } from "@/db/schema";
import type { BloodMarker } from "@/db/schema";

export async function getBloodMarkers(): Promise<BloodMarker[]> {
  return db
    .select()
    .from(bloodMarkers)
    .orderBy(desc(bloodMarkers.date), asc(bloodMarkers.category), asc(bloodMarkers.id))
    .all();
}

export type BloodPanel = {
  date: string;
  clinic: string | null;
  markers: BloodMarker[];
};

/** Group markers into dated panels (newest first). */
export async function getBloodPanels(): Promise<BloodPanel[]> {
  const rows = await getBloodMarkers();
  const byDate = new Map<string, BloodPanel>();
  for (const r of rows) {
    const panel = byDate.get(r.date) ?? { date: r.date, clinic: r.clinic, markers: [] };
    panel.markers.push(r);
    if (!panel.clinic && r.clinic) panel.clinic = r.clinic;
    byDate.set(r.date, panel);
  }
  return [...byDate.values()];
}

export function markerStatus(m: BloodMarker): "low" | "high" | "ok" | "unknown" {
  if (m.refLow == null && m.refHigh == null) return "unknown";
  if (m.refLow != null && m.value < m.refLow) return "low";
  if (m.refHigh != null && m.value > m.refHigh) return "high";
  return "ok";
}
