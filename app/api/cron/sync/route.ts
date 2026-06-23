import { NextResponse, type NextRequest } from "next/server";
import { isConnected } from "@/lib/integrations/google-health";
import { syncGoogleHealth } from "@/lib/integrations/sync";

// The first sync pulls years of history; give it room beyond the default ~10s.
export const maxDuration = 60;

/**
 * Sync trigger — authenticates with CRON_SECRET, not a session. Primary caller
 * is the GitHub Actions poller (.github/workflows/sync.yml), every 30 min during
 * waking hours; the Vercel cron in vercel.json (12:00 UTC daily) is a fallback
 * for if Actions is ever throttled or auto-disabled. Idempotent + bounded, and
 * the 7-day sync lookback backfills anything that lands between runs.
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
