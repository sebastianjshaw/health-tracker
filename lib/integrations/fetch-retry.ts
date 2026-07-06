/**
 * fetch() wrapper that retries transient upstream failures — network errors and
 * 5xx responses — with a short exponential backoff. Google Health and Withings
 * both throw occasional 500s that vanish on a second attempt; without a retry a
 * single blip aborts the whole sync (and fails the cron workflow).
 *
 * Only 5xx and thrown network errors retry. 4xx (auth, ACCOUNT_NOT_LINKED, bad
 * request) fail fast — retrying them is pointless and would just delay the real
 * error. The final attempt's Response (even a 5xx) is returned as-is so callers
 * keep their existing status/body error handling.
 */
export async function fetchRetry(
  input: string | URL,
  init?: RequestInit,
  opts: { retries?: number; baseDelayMs?: number } = {},
): Promise<Response> {
  const retries = opts.retries ?? 2;
  const base = opts.baseDelayMs ?? 300;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, init);
      if (res.status < 500 || attempt === retries) return res;
    } catch (e) {
      if (attempt === retries) throw e;
    }
    await new Promise((r) => setTimeout(r, base * 2 ** attempt)); // 300ms, 600ms, …
  }
  // Unreachable: the loop returns or throws on its final iteration.
  throw new Error("fetchRetry: exhausted retries");
}
