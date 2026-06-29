// AI estimation of dietary fiber for foods logged without fiber data.
// Used both for the one-off backfill (db/backfill-fiber.ts) and for filling
// fiber when a food is saved without it (app/(main)/food/actions.ts).
//
// Estimates are per-serving grams, aligned to the carbs basis the food carries
// (fiber is a subset of carbs). Anything the model can't reasonably estimate
// comes back as null so the caller can leave it blank rather than guess 0.

import Anthropic from "@anthropic-ai/sdk";

// Fiber estimation is a cheap, simple lookup task — Haiku handles it well and
// keeps the backfill (and per-save estimates) cheap.
const MODEL = "claude-haiku-4-5";
const BATCH = 40;

export type FiberEstimateInput = {
  name: string;
  /** Grams of carbohydrate in the same serving (fiber ≤ carbs). null if unknown. */
  carbs?: number | null;
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — cannot estimate fiber.");
  }
  return (client ??= new Anthropic());
}

const SYSTEM =
  "You are a nutrition database. For each food you are given its name and the " +
  "grams of carbohydrate in one serving. Estimate the grams of dietary fiber in " +
  "that same serving. Dietary fiber is a subset of carbohydrate, so fiber must " +
  "never exceed carbs. Base estimates on typical published values for the food. " +
  "Use -1 (not 0) when the food has no meaningful fiber estimate or is too vague " +
  "to judge (e.g. a generic drink, alcohol, or an unrecognisable name). Return 0 " +
  "only for foods that genuinely contain no fiber (e.g. plain meat, egg, oil).";

const FORMAT = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    properties: {
      estimates: {
        type: "array",
        items: {
          type: "object",
          properties: { fiber: { type: "number" } },
          required: ["fiber"],
          additionalProperties: false,
        },
      },
    },
    required: ["estimates"],
    additionalProperties: false,
  },
};

async function estimateBatch(items: FiberEstimateInput[]): Promise<(number | null)[]> {
  const list = items
    .map((it, i) => `${i + 1}. ${it.name} — carbs: ${it.carbs == null ? "unknown" : `${it.carbs}g`}`)
    .join("\n");

  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    output_config: { format: FORMAT }, // note: `effort` is not supported on Haiku 4.5
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `Estimate dietary fiber (grams per serving) for these ${items.length} foods. ` +
          `Return one estimate per food, in the same order:\n\n${list}`,
      },
    ],
  });

  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return items.map(() => null);
  let parsed: { estimates?: { fiber: number }[] };
  try {
    parsed = JSON.parse(text.text);
  } catch {
    return items.map(() => null);
  }
  const estimates = parsed.estimates ?? [];

  return items.map((it, i) => {
    const raw = estimates[i]?.fiber;
    if (raw == null || !Number.isFinite(raw) || raw < 0) return null;
    let fiber = Math.round(raw * 10) / 10;
    // Never let an estimate exceed the carbs it's a subset of.
    if (it.carbs != null && it.carbs >= 0 && fiber > it.carbs) fiber = it.carbs;
    return fiber;
  });
}

/** Estimate per-serving fiber (g) for each input, batched. null = no estimate. */
export async function estimateFiberGrams(items: FiberEstimateInput[]): Promise<(number | null)[]> {
  const out: (number | null)[] = [];
  for (let i = 0; i < items.length; i += BATCH) {
    out.push(...(await estimateBatch(items.slice(i, i + BATCH))));
  }
  return out;
}

/** Estimate a single food's fiber. Returns null if it can't be estimated. */
export async function estimateFiberOne(name: string, carbs?: number | null): Promise<number | null> {
  const [fiber] = await estimateFiberGrams([{ name, carbs }]);
  return fiber ?? null;
}
