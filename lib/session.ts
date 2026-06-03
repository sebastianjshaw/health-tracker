// Edge-safe session helpers. Uses Web Crypto only (no Node APIs) so it can be
// imported from proxy.ts (which runs on the edge runtime).

export const SESSION_COOKIE = "ht_session";

export function sessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.APP_PASSWORD ||
    "insecure-dev-secret"
  );
}

/**
 * Deterministic token derived from the secret. The cookie holds this value;
 * it is unguessable without the secret but constant per-secret, which is fine
 * for a single-user app.
 */
export async function computeToken(secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("authenticated-v1"));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function isValidToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  return token === (await computeToken(sessionSecret()));
}
