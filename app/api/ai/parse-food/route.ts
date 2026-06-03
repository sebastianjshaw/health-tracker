import type { NextRequest } from "next/server";
import { FOOD_MODEL, getAnthropic } from "@/lib/anthropic";
import { MEALS } from "@/lib/constants";

// Structured-outputs schema: the model returns one entry per food item, with
// nutrition as the TOTAL for the portion described (not per 100g).
const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "Short food name, e.g. 'Boiled egg'" },
          meal: { type: "string", enum: MEALS as unknown as string[] },
          quantity: { type: "number", description: "Servings/units described, e.g. 2 eggs -> 2" },
          unit: { type: "string", description: "Unit, e.g. 'egg', 'g', 'slice', 'serving'" },
          kcal: { type: "number", description: "Total calories for the whole portion" },
          protein: { type: "number", description: "Total protein (g) for the whole portion" },
          carbs: { type: "number", description: "Total carbs (g) for the whole portion" },
          fat: { type: "number", description: "Total fat (g) for the whole portion" },
        },
        required: ["name", "meal", "quantity", "unit", "kcal", "protein", "carbs", "fat"],
      },
    },
  },
  required: ["items"],
} as const;

const SYSTEM = `You convert a free-text description of food a person ate into structured entries.
Rules:
- Output one item per distinct food.
- Estimate realistic nutrition TOTALS for the whole portion described (account for the quantity), not per-100g values.
- If the description names or implies a meal (breakfast/lunch/dinner/snacks), use it; otherwise infer from the foods, defaulting to "snacks".
- Round nutrition to whole numbers. Be concise in names.`;

export async function POST(req: NextRequest) {
  const client = getAnthropic();
  if (!client) {
    return Response.json(
      { error: "AI is not configured. Set ANTHROPIC_API_KEY to enable this feature." },
      { status: 503 },
    );
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) return Response.json({ error: "Describe what you ate." }, { status: 400 });

  try {
    const message = await client.messages.create({
      model: FOOD_MODEL,
      max_tokens: 2048,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: text }],
    });

    if (message.stop_reason === "refusal") {
      return Response.json({ error: "Could not parse that. Try rephrasing." }, { status: 422 });
    }

    const block = message.content.find((b) => b.type === "text");
    const raw = block && block.type === "text" ? block.text : "{}";
    const parsed = JSON.parse(raw) as { items?: unknown };
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    return Response.json({ items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI request failed";
    return Response.json({ error: msg }, { status: 502 });
  }
}
