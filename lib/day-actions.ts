"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { dayHealth } from "@/db/schema";
import { actionFail, actionOk, type ActionResult } from "./action-result";
import { requireAuth } from "./auth";
import { HEALTH_STATUSES, HealthStatus } from "./constants";
import { isValidISO } from "./date";
import { revalidatePaths } from "./revalidate";

/** Set a day's health status. "healthy" is the default, so it's stored as the
 * absence of a row — selecting it clears any existing record. */
export async function setDayHealth(
  date: string,
  status: HealthStatus,
): Promise<ActionResult> {
  await requireAuth();
  if (!isValidISO(date)) return actionFail("Invalid date");
  if (!HEALTH_STATUSES.includes(status)) return actionFail("Invalid status");

  if (status === "healthy") {
    await db.delete(dayHealth).where(eq(dayHealth.date, date));
  } else {
    await db
      .insert(dayHealth)
      .values({ date, status })
      .onConflictDoUpdate({ target: dayHealth.date, set: { status } });
  }

  revalidatePaths("/", "/stats");
  return actionOk();
}
