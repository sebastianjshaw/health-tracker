import { NextResponse, type NextRequest } from "next/server";
import { isConnected } from "@/lib/integrations/google-health";
import { syncGoogleHealth } from "@/lib/integrations/sync";

// The first sync pulls years of history; give it room beyond the default ~10s.
export const maxDuration = 60;

/**
 * Daily Vercel cron (see vercel.json: `30 6 * * *`) — authenticates with
 * CRON_SECRET, not a session. 06:30 UTC = 08:30 Stockholm in summer (CEST),
 * 07:30 in winter (CET); chosen to run just after the morning weigh-in. Crons
 * are UTC-only so the local time drifts with DST, but the 7-day sync lookback
 * backfills any reading that lands after the run, so nothing is lost.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isConnected())) {
    return NextResponse.json({ ok: true, skipped: "not connected" });
  }
  try {
    const summary = await syncGoogleHealth();
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "sync failed" },
      { status: 500 },
    );
  }
}
