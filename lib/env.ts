import "server-only";

/** Fail fast in production when required secrets are missing. */
export function validateServerEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];
  if (!process.env.SESSION_SECRET?.trim()) missing.push("SESSION_SECRET");
  if (!process.env.APP_PASSWORD?.trim()) missing.push("APP_PASSWORD");
  // The sync endpoint 401s every caller without this, so a missing secret means
  // sync silently never runs — fail fast instead (cron + GitHub poller need it).
  if (!process.env.CRON_SECRET?.trim()) missing.push("CRON_SECRET");
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
}
