import "server-only";
import { getSetting, setSetting } from "@/lib/settings";
import { groupsToReadings, MEASURE_TYPES, type MeasureGroup, type WithingsReading } from "./withings-parse";

export { MEASURE_TYPES, type WithingsReading };

/**
 * Withings Cloud integration — OAuth 2.0 + the Measure `getmeas` endpoint.
 * Docs: https://developer.withings.com/api-reference/#tag/measure
 *
 * Why this exists separately from the Google Health integration: the scale
 * uploads to Withings' cloud directly over Wi-Fi, so reading from here needs no
 * phone/Health-Connect bridge — the reason a weigh-in could otherwise sit
 * unsynced until the Withings app next woke up. This is the source of truth for
 * body composition (weight, body-fat, and the measured lean/muscle/bone/water
 * split the Google Health API never exposed); Google Health keeps activities,
 * sleep and resting HR. Single-user: tokens live in the `settings` k/v store.
 *
 * Two Withings-specific gotchas this module handles:
 *  1. The refresh token is single-use and ROTATES on every refresh — we must
 *     persist the new one each cycle or the connection silently dies.
 *  2. Measures are integer mantissa + power-of-ten exponent: real = value·10^unit.
 */

const AUTH_URL = "https://account.withings.com/oauth2_user/authorize2";
const TOKEN_URL = "https://wbsapi.withings.net/v2/oauth2";
const MEASURE_URL = "https://wbsapi.withings.net/measure";

// Body metrics only — we don't read activity/sleep from Withings (Google Health
// covers those, and the scale doesn't produce them).
export const WITHINGS_SCOPE = "user.metrics";

const TOKENS_KEY = "withings";
const CURSOR_KEY = "withingsCursor"; // epoch seconds of the last sync's updatetime

export type WithingsTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  userId: string;
  scope: string;
};

export function isConfigured(): boolean {
  return Boolean(process.env.WITHINGS_CLIENT_ID && process.env.WITHINGS_CLIENT_SECRET);
}

export async function getTokens(): Promise<WithingsTokens | null> {
  const t = await getSetting<WithingsTokens | null>(TOKENS_KEY, null);
  return t && t.refreshToken ? t : null;
}
export async function isConnected(): Promise<boolean> {
  return (await getTokens()) != null;
}
export async function disconnect(): Promise<void> {
  await setSetting(TOKENS_KEY, null);
}

/** Cursor is the `updatetime` (epoch seconds) returned by the last getmeas, so
 * the next sync only asks for measures stored since then. Null = never synced. */
export async function getCursor(): Promise<number | null> {
  return getSetting<number | null>(CURSOR_KEY, null);
}
export async function setCursor(updatetime: number): Promise<void> {
  await setSetting(CURSOR_KEY, updatetime);
}

/** OAuth consent URL. `redirectUri` must match a URI registered on the Withings
 * developer app exactly. */
export function authUrl(state: string, redirectUri: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.WITHINGS_CLIENT_ID ?? "",
    scope: WITHINGS_SCOPE,
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

// Withings wraps every response as { status, body }; status 0 = OK. Auth/token
// calls share the same envelope.
type Envelope<T> = { status: number; body?: T; error?: string };

type TokenBody = {
  userid?: string | number;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

async function postForm<T>(url: string, params: Record<string, string>, bearer?: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`Withings HTTP ${res.status}`);
  const json = (await res.json()) as Envelope<T>;
  if (json.status !== 0) {
    throw new Error(`Withings API error ${json.status}${json.error ? `: ${json.error}` : ""}`);
  }
  return json.body as T;
}

function storeTokens(body: TokenBody, prev?: WithingsTokens): WithingsTokens {
  return {
    accessToken: body.access_token ?? "",
    refreshToken: body.refresh_token ?? prev?.refreshToken ?? "",
    expiresAt: Date.now() + ((body.expires_in ?? 10800) - 60) * 1000,
    userId: String(body.userid ?? prev?.userId ?? ""),
    scope: body.scope ?? prev?.scope ?? WITHINGS_SCOPE,
  };
}

/** Exchange an authorization code for tokens and persist them. */
export async function exchangeCode(code: string, redirectUri: string): Promise<boolean> {
  try {
    const body = await postForm<TokenBody>(TOKEN_URL, {
      action: "requesttoken",
      grant_type: "authorization_code",
      client_id: process.env.WITHINGS_CLIENT_ID ?? "",
      client_secret: process.env.WITHINGS_CLIENT_SECRET ?? "",
      code,
      redirect_uri: redirectUri,
    });
    if (!body.access_token || !body.refresh_token) return false;
    await setSetting<WithingsTokens>(TOKENS_KEY, storeTokens(body));
    return true;
  } catch {
    return false;
  }
}

/** Return a valid access token, refreshing if expired. The refresh response
 * carries a NEW refresh token (the old one is now invalid) — persist both. */
export async function getAccessToken(): Promise<string | null> {
  const tokens = await getTokens();
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt) return tokens.accessToken;

  const body = await postForm<TokenBody>(TOKEN_URL, {
    action: "requesttoken",
    grant_type: "refresh_token",
    client_id: process.env.WITHINGS_CLIENT_ID ?? "",
    client_secret: process.env.WITHINGS_CLIENT_SECRET ?? "",
    refresh_token: tokens.refreshToken,
  });
  const next = storeTokens(body, tokens);
  await setSetting<WithingsTokens>(TOKENS_KEY, next);
  return next.accessToken;
}

// ---- getmeas ----

type MeasureBody = {
  updatetime?: number;
  timezone?: string;
  measuregrps?: MeasureGroup[];
};

/**
 * Fetch measures and reduce to the latest reading per local day. `since` (epoch
 * seconds, nullable) maps to getmeas `lastupdate` so incremental syncs only pull
 * what changed; a null `since` pulls the full (modest) scale history. Returns the
 * readings plus the response `updatetime` to advance the cursor.
 */
export async function getMeasures(
  accessToken: string,
  since: number | null,
): Promise<{ readings: WithingsReading[]; updatetime: number | null }> {
  const params: Record<string, string> = {
    action: "getmeas",
    category: "1", // real measurements (not goals)
    meastypes: Object.values(MEASURE_TYPES).join(","),
  };
  if (since != null) params.lastupdate = String(since);

  const body = await postForm<MeasureBody>(MEASURE_URL, params, accessToken);
  const tz = body.timezone || "UTC";
  return {
    readings: groupsToReadings(body.measuregrps ?? [], tz),
    updatetime: body.updatetime ?? null,
  };
}

// ---- Notify (webhook) ----
// Withings pushes a notification the instant a measurement is recorded, so a
// weigh-in syncs within seconds without depending on the (flaky) polling cron.
const NOTIFY_URL = "https://wbsapi.withings.net/notify";
const NOTIFY_APPLI = "1"; // 1 = new weight-related (smart-scale) data

/** The Withings user id we're connected as — to verify inbound notifications. */
export async function getUserId(): Promise<string | null> {
  return (await getTokens())?.userId ?? null;
}

/**
 * Subscribe `callbackUrl` to weight notifications (appli=1). Withings validates
 * the URL by calling it during subscribe, so it must be publicly reachable and
 * 200. Idempotent: re-subscribing the same URL is a no-op on Withings' side.
 * Best-effort — returns false (rather than throwing) so a hiccup never blocks
 * the OAuth connect flow.
 */
export async function subscribeNotifications(callbackUrl: string): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;
  try {
    await postForm(NOTIFY_URL, { action: "subscribe", callbackurl: callbackUrl, appli: NOTIFY_APPLI, comment: "Baseline" }, token);
    return true;
  } catch {
    return false;
  }
}

/** Remove a notification subscription (called on disconnect). Best-effort. */
export async function revokeNotifications(callbackUrl: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) return;
  try {
    await postForm(NOTIFY_URL, { action: "revoke", callbackurl: callbackUrl, appli: NOTIFY_APPLI }, token);
  } catch {
    /* best-effort */
  }
}
