/** Drop trailing zeros: 1 -> "1", 1.5 -> "1.5", 0.25 -> "0.25". */
export function trimNum(n: number): string {
  return Number(n.toFixed(2)).toString();
}

export function servingLabel(quantity: number, servingSize: number, unit: string): string {
  if (unit === "serving") {
    const q = quantity * servingSize;
    return `${trimNum(q)} ${q === 1 ? "serving" : "servings"}`;
  }
  return `${trimNum(quantity * servingSize)} ${unit}`;
}
