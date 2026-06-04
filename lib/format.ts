/** Drop trailing zeros: 1 -> "1", 1.5 -> "1.5", 0.25 -> "0.25". */
export function trimNum(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/** Parse a form value to a number, falling back when blank/invalid. */
export function num(v: unknown, fallback = 0): number {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

/** Parse a form value to a number, or null when blank/invalid. */
export function nullableNum(v: unknown): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function servingLabel(quantity: number, servingSize: number, unit: string): string {
  if (unit === "serving") {
    const q = quantity * servingSize;
    return `${trimNum(q)} ${q === 1 ? "serving" : "servings"}`;
  }
  return `${trimNum(quantity * servingSize)} ${unit}`;
}
