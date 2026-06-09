import "server-only";
import { getSetting, setSetting } from "@/lib/settings";

/**
 * Google Health API integration — OAuth 2.0 (web-server flow) + typed reads.
 * Docs: https://developers.google.com/health  (REST v4, dataPoints.list).
 * Single-user: tokens live in the `settings` k/v store.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://health.googleapis.com/v4/users/me/dataTypes";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
];

// Endpoint data-type ids are kebab-case; the `filter` param uses snake_case.
export const DATA_TYPES = {
  exercise: "exercise",
  sleep: "sleep",
  restingHr: "daily-resting-heart-rate",
} as const;

const TOKENS_KEY = "googleHealth";
const CURSOR_KEY = "googleHealthCursor";

export type GoogleTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  scope: string;
};

export function isConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export async function getTokens(): Promise<GoogleTokens | null> {
  const t = await getSetting<GoogleTokens | null>(TOKENS_KEY, null);
  return t && t.refreshToken ? t : null;
}
export async function isConnected(): Promise<boolean> {
  return (await getTokens()) != null;
}
export async function disconnect(): Promise<void> {
  await setSetting(TOKENS_KEY, null);
}
export async function getCursor(): Promise<string | null> {
  return getSetting<string | null>(CURSOR_KEY, null);
}
export async function setCursor(date: string): Promise<void> {
  await setSetting(CURSOR_KEY, date);
}

/** OAuth consent URL. `redirectUri` must match a registered URI exactly. */
export function authUrl(state: string, redirectUri: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline", // get a refresh token
    prompt: "consent", // force refresh-token issue on re-consent
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

/** Exchange an auth code for tokens and persist them. */
export async function exchangeCode(code: string, redirectUri: string): Promise<boolean> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as TokenResponse;
  if (!data.access_token || !data.refresh_token) return false;
  await setSetting<GoogleTokens>(TOKENS_KEY, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    scope: data.scope ?? GOOGLE_SCOPES.join(" "),
  });
  return true;
}

/** Return a valid access token, refreshing if expired. Null if not connected. */
export async function getAccessToken(): Promise<string | null> {
  const tokens = await getTokens();
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt) return tokens.accessToken;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: tokens.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed (${res.status})`);
  const data = (await res.json()) as TokenResponse;
  await setSetting<GoogleTokens>(TOKENS_KEY, {
    ...tokens,
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  });
  return data.access_token;
}

export type DataPoint = Record<string, unknown>;

/**
 * List all data points of a type within [startISO, endISO), following pages.
 * `dataType` is the kebab-case endpoint id; `filterField` is the snake_case
 * prefix used in the time filter (e.g. "exercise.interval.start_time").
 */
export async function listDataPoints(
  accessToken: string,
  dataType: string,
  filter: string,
): Promise<DataPoint[]> {
  const out: DataPoint[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${API_BASE}/${dataType}/dataPoints`);
    url.searchParams.set("filter", filter);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Google Health ${dataType} fetch failed (${res.status})`);
    }
    const data = (await res.json()) as { dataPoints?: DataPoint[]; nextPageToken?: string };
    if (data.dataPoints) out.push(...data.dataPoints);
    pageToken = data.nextPageToken || undefined;
  } while (pageToken);
  return out;
}
