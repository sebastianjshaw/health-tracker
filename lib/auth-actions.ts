"use server";

import { redirect } from "next/navigation";
import { destroySession, requireAuth } from "@/lib/auth";

export async function logout(): Promise<void> {
  await requireAuth();
  await destroySession();
  redirect("/login");
}
