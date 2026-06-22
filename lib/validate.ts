/** Numeric input guards for server actions — keep NaN/Infinity (which a buggy
 * client or API call can send) out of the database, where they'd persist as
 * garbage and break every downstream calculation. */

/** True for a real, finite number (rejects NaN, ±Infinity, and non-numbers). */
export function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** True when a nullable/optional numeric field is either absent or finite. */
export function isFiniteOrNull(n: number | null | undefined): boolean {
  return n == null || isFiniteNum(n);
}
