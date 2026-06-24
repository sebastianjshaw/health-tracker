import { NextResponse, type NextRequest } from "next/server";
import { isConnected as googleConnected } from "@/lib/integrations/google-health";
import { isConnected as withingsConnected } from "@/lib/integrations/withings";
import { syncGoogleHealth, syncWithings } from "@/lib/integrations/sync";

// The first sync pulls years of history; give it room beyond the default ~10s.
export const maxDuration = 60;

/**
 * Sync trigger — authenticates with CRON_SECRET, not a session. Primary caller
 * is the GitHub Actions poller (.github/workflows/sync.yml), every 30 min during
 * waking hours; the Vercel cron in vercel.json (12:00 UTC daily) is a fallback
 * for if Actions is ever throttled or auto-disabled. Idempotent + bounded, and
 * the lookback on each source backfills anything that lands between runs.
 *
 * Two sources run independently: Google Health (activities, sleep, resting HR)
 * and Withings (body composition, straight from the scale's cloud — no phone
 * bridge). One failing or being disconnected doesn't block the other; the job
 * only reports HTTP 500 if a connected source actually errors.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [google, withings] = await Promise.all([googleConnected(), withingsConnected()]);
  if (!google && !withings) {
    return NextResponse.json({ ok: true, skipped: "not connected" });
  }

  const result: Record<string, unknown> = {};
  const errors: string[] = [];

  if (google) {
    try {
      result.google = await syncGoogleHealth();
    } catch (e) {
      errors.push(`google-health: ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  if (withings) {
    try {
      result.withings = await syncWithings();
    } catch (e) {
      errors.push(`withings: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  if (errors.length) {
    return NextResponse.json({ ok: false, errors, ...result }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...result });
}
