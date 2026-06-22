import { NextResponse, type NextRequest } from "next/server";
import { isConnected } from "@/lib/integrations/google-health";
import { syncGoogleHealth } from "@/lib/integrations/sync";

// The first sync pulls years of history; give it room beyond the default ~10s.
export const maxDuration = 60;

/**
 * Vercel cron (see vercel.json) — authenticates with CRON_SECRET, not a session.
 * Two runs/day (the Hobby-plan limit): 06:30 UTC after the morning weigh-in and
 * 12:00 UTC ~an hour after the main midday workout. In Stockholm that's 08:30 &
 * 14:00 in summer (CEST), an hour earlier in winter (CET) — crons are UTC-only
 * so local time drifts with DST. Hobby crons also fire within the hour, not on
 * the exact minute. None of that loses data: the 7-day sync lookback backfills
 * anything that lands after a run, on the next run.
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
