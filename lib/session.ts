// Edge-safe session helpers. Uses Web Crypto only (no Node APIs) so it can be
// imported from proxy.ts (which runs on the edge runtime).

export const SESSION_COOKIE = "ht_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function sessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.APP_PASSWORD ||
    "insecure-dev-secret"
  );
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * A signed, expiring session token: `v1.<exp>.<hmac>` where the HMAC covers
 * `v1.<exp>`. The secret signs it (unguessable) and `exp` bounds its lifetime,
 * so a leaked cookie stops working after expiry. Stateless (no server store).
 */
export async function createToken(secret = sessionSecret()): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `v1.${exp}`;
  return `${payload}.${await hmacHex(secret, payload)}`;
}

export async function isValidToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;

  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) return false;

  const expected = await hmacHex(sessionSecret(), `v1.${parts[1]}`);
  return constantTimeEqual(parts[2], expected);
}
