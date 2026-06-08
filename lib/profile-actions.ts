"use server";

import { actionOk, type ActionResult } from "./action-result";
import { requireAuth } from "./auth";
import { Profile, setProfile } from "./settings";
import { revalidatePaths } from "./revalidate";

export async function saveProfile(profile: Profile): Promise<ActionResult> {
  await requireAuth();
  await setProfile(profile);
  revalidatePaths("/report", "/profile");
  return actionOk();
}
