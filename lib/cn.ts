export type ClassValue = string | number | false | null | undefined;

/** Minimal classnames joiner. */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
