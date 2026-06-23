import "server-only";

/** Fail fast in production when required secrets are missing. */
export function validateServerEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];
  if (!process.env.SESSION_SECRET?.trim()) missing.push("SESSION_SECRET");
  if (!process.env.APP_PASSWORD?.trim()) missing.push("APP_PASSWORD");
  // NB: CRON_SECRET is deliberately NOT required here — it's only used by the
  // /api/cron/sync route, which 401s gracefully without it. Gating the whole
  // app's build/boot on it (validateServerEnv runs via the db import on every
  // page) is too broad, and broke a deploy when the var wasn't in Vercel.
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
}
