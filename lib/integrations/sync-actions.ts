"use server";

import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { requireAuth } from "@/lib/auth";
import { revalidatePaths } from "@/lib/revalidate";
import { disconnect as disconnectGoogleHealth, isConnected as googleConnected } from "./google-health";
import { disconnect as disconnectWithingsCloud, isConnected as withingsConnected } from "./withings";
import { syncGoogleHealth, syncWithings } from "./sync";

const SYNC_PATHS = ["/", "/stats", "/activity", "/settings", "/report"] as const;

/** Sync both connected sources. Each runs independently so one failing (or being
 * disconnected) doesn't block the other; the message reports whatever ran. */
export async function syncNow(full = false): Promise<ActionResult> {
  await requireAuth();
  const parts: string[] = [];
  const errors: string[] = [];

  if (await googleConnected()) {
    try {
      const s = await syncGoogleHealth({ full });
      parts.push(
        `${s.exercise} activities, ${s.activeDays} movement days, ${s.sleep} sleep nights, ${s.restingHr} HR days`,
      );
    } catch (e) {
      errors.push(`Google Health: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  if (await withingsConnected()) {
    try {
      const w = await syncWithings({ full });
      parts.push(`${w.days} body-comp days from Withings`);
    } catch (e) {
      errors.push(`Withings: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  revalidatePaths(...SYNC_PATHS);
  if (errors.length) return actionFail(errors.join(" · "));
  if (!parts.length) return actionFail("Nothing connected to sync.");
  return actionOk(`Synced ${parts.join("; ")}.`);
}

export async function disconnectGoogle(): Promise<ActionResult> {
  await requireAuth();
  await disconnectGoogleHealth();
  revalidatePaths("/settings");
  return actionOk();
}

export async function disconnectWithings(): Promise<ActionResult> {
  await requireAuth();
  await disconnectWithingsCloud();
  revalidatePaths("/settings");
  return actionOk();
}
