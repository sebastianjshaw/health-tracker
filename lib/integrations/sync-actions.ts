"use server";

import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { requireAuth } from "@/lib/auth";
import { revalidatePaths } from "@/lib/revalidate";
import { disconnect } from "./google-health";
import { syncGoogleHealth } from "./sync";

export async function syncNow(full = false): Promise<ActionResult> {
  await requireAuth();
  try {
    const s = await syncGoogleHealth({ full });
    revalidatePaths("/", "/stats", "/activity", "/settings", "/report");
    return actionOk(
      `Synced ${s.exercise} activities, ${s.activeDays} movement days, ${s.sleep} sleep nights, ${s.restingHr} HR days, ${s.body} body-comp days.`,
    );
  } catch (e) {
    return actionFail(e instanceof Error ? e.message : "Sync failed");
  }
}

export async function disconnectGoogle(): Promise<ActionResult> {
  await requireAuth();
  await disconnect();
  revalidatePaths("/settings");
  return actionOk();
}
