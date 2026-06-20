import "server-only";
import { and, gte, lte, eq } from "drizzle-orm";
import { db } from "@/db";
import { dailyActivity, dayHealth } from "@/db/schema";
import { HealthStatus } from "./constants";

/** A day's health status; defaults to "healthy" when nothing is stored. */
export async function getDayHealth(date: string): Promise<HealthStatus> {
  const row = await db.select().from(dayHealth).where(eq(dayHealth.date, date)).get();
  return (row?.status as HealthStatus) ?? "healthy";
}

/** A day's passive movement (steps + distance) imported from the provider, or
 * null when nothing has been synced for that date. */
export async function getDayActivity(
  date: string,
): Promise<{ steps: number; distanceKm: number } | null> {
  const row = await db.select().from(dailyActivity).where(eq(dailyActivity.date, date)).get();
  if (!row || (row.steps == null && row.distanceKm == null)) return null;
  return { steps: row.steps ?? 0, distanceKm: row.distanceKm ?? 0 };
}

/**
 * Non-default health statuses within an inclusive [start, end] range, as a
 * plain date→status map (healthy days are absent, treated as the default).
 */
export async function getHealthSeries(
  start: string,
  end: string,
): Promise<Record<string, HealthStatus>> {
  const rows = await db
    .select()
    .from(dayHealth)
    .where(and(gte(dayHealth.date, start), lte(dayHealth.date, end)))
    .all();
  const out: Record<string, HealthStatus> = {};
  for (const r of rows) out[r.date] = r.status as HealthStatus;
  return out;
}
