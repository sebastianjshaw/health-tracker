import { revalidatePath } from "next/cache";

/** Revalidate several routes after a mutation (call inside a Server Action). */
export function revalidatePaths(...paths: string[]): void {
  for (const p of paths) revalidatePath(p);
}
