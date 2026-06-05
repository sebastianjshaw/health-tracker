"use server";

import { requireAuth } from "./auth";
import { Profile, setProfile } from "./settings";
import { revalidatePaths } from "./revalidate";

export async function saveProfile(profile: Profile): Promise<void> {
  await requireAuth();
  await setProfile(profile);
  revalidatePaths("/report", "/stats");
}
