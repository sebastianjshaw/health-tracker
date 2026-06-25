import { NextResponse, type NextRequest } from "next/server";
import { getUserId } from "@/lib/integrations/withings";
import { syncWithings } from "@/lib/integrations/sync";

// A sync is quick (one getmeas + small merge), but give it headroom over the
// ~10s default so Withings always gets its 200.
export const maxDuration = 30;

/**
 * Withings Notify webhook — Withings POSTs here the instant a measurement is
 * recorded (appli=1), so a weigh-in lands within seconds with no polling.
 *
 * Public by necessity (Withings has no session); it's exempt from the auth proxy.
 * Safe regardless: the payload is only a TRIGGER — we ignore its contents and run
 * our own token-authenticated getmeas sync, so a spoofed POST can at most trigger
 * a redundant (idempotent) read of our own data, never inject anything. We still
 * check the userid matches the connected account and ack everything with 200.
 */
export async function POST(request: NextRequest) {
  let userid: string | null = null;
  try {
    const form = await request.formData();
    userid = form.get("userid")?.toString() ?? null;
  } catch {
    // Subscribe-time validation ping may have no/!form body — just ack.
    return NextResponse.json({ ok: true });
  }

  const expected = await getUserId();
  // No userid → validation ping. Mismatch → not us; ack without doing work.
  if (userid && expected && userid === expected) {
    try {
      await syncWithings();
    } catch (e) {
      console.error("[withings-notify] sync failed:", e instanceof Error ? e.message : e);
      // Still 200 — Withings retries on non-2xx, and the polling cron is a backstop.
    }
  }
  return NextResponse.json({ ok: true });
}

/** Withings validates the callback URL with a GET/HEAD during subscribe. */
export async function GET() {
  return NextResponse.json({ ok: true });
}
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
