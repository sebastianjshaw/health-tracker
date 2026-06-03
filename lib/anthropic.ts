import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export function getAnthropic(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

// Cheap, fast model — this is a simple structured-extraction task, not reasoning.
export const FOOD_MODEL = "claude-haiku-4-5";
