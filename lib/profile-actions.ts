"use server";

import { Profile, setProfile } from "./settings";
import { revalidatePaths } from "./revalidate";

export async function saveProfile(profile: Profile): Promise<void> {
  await setProfile(profile);
  revalidatePaths("/report", "/stats");
}
