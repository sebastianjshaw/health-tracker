import type { NextRequest } from "next/server";
import { getFoodByBarcode } from "@/lib/food-data";
import { lookupBarcode } from "@/lib/openfoodfacts";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/barcode/[code]">,
) {
  const { code } = await ctx.params;
  const barcode = code.trim();
  if (!barcode) {
    return Response.json({ found: false, error: "No barcode" }, { status: 400 });
  }

  // Prefer a product already in the library (keeps the user's own nutrition).
  const local = await getFoodByBarcode(barcode);
  if (local) {
    return Response.json({
      found: true,
      inLibraryId: local.id,
      product: {
        name: local.name,
        brand: local.brand,
        barcode: local.barcode,
        servingSize: local.servingSize,
        servingUnit: local.servingUnit,
        kcal: local.kcal,
        protein: local.protein,
        carbs: local.carbs,
        fat: local.fat,
        fiber: local.fiber,
        source: local.source,
      },
    });
  }

  const product = await lookupBarcode(barcode);
  if (!product) {
    return Response.json({ found: false, barcode }, { status: 404 });
  }

  return Response.json({ found: true, product });
}
