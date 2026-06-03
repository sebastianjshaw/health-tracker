// OpenFoodFacts lookup — free, no API key. Values normalised to per-100g/ml,
// matching our "per serving" convention with servingSize 100.

export type ScannedProduct = {
  name: string;
  brand: string | null;
  barcode: string;
  servingSize: number;
  servingUnit: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  saturatedFat: number | null;
  salt: number | null;
  sodium: number | null;
  source: "openfoodfacts";
};

type OFFNutriments = Record<string, number | string | undefined>;

function n(nutriments: OFFNutriments, key: string): number {
  const v = nutriments[key];
  const num = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(num) ? (num as number) : 0;
}

function nn(nutriments: OFFNutriments, key: string): number | null {
  const v = nutriments[key];
  if (v == null || v === "") return null;
  const num = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(num) ? (num as number) : null;
}

export async function lookupBarcode(
  barcode: string,
): Promise<ScannedProduct | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
    barcode,
  )}.json?fields=product_name,brands,nutriments,quantity`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "HealthTracker/1.0 (personal use)" },
      // OFF data changes rarely; cache for a day.
      next: { revalidate: 86400 },
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;
  const data = (await res.json()) as {
    status?: number;
    product?: {
      product_name?: string;
      brands?: string;
      quantity?: string;
      nutriments?: OFFNutriments;
    };
  };

  if (data.status !== 1 || !data.product) return null;
  const p = data.product;
  const nutriments = p.nutriments ?? {};

  const isMl = /ml|cl|l\b/i.test(p.quantity ?? "");

  return {
    name: p.product_name?.trim() || `Product ${barcode}`,
    brand: p.brands?.split(",")[0]?.trim() || null,
    barcode,
    servingSize: 100,
    servingUnit: isMl ? "ml" : "g",
    kcal: n(nutriments, "energy-kcal_100g"),
    protein: n(nutriments, "proteins_100g"),
    carbs: n(nutriments, "carbohydrates_100g"),
    fat: n(nutriments, "fat_100g"),
    fiber: nn(nutriments, "fiber_100g"),
    sugar: nn(nutriments, "sugars_100g"),
    saturatedFat: nn(nutriments, "saturated-fat_100g"),
    salt: nn(nutriments, "salt_100g"),
    // OFF reports sodium in grams; store as mg
    sodium: (() => {
      const s = nn(nutriments, "sodium_100g");
      return s == null ? null : Math.round(s * 1000);
    })(),
    source: "openfoodfacts",
  };
}
