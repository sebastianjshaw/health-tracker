import { NextResponse, type NextRequest } from "next/server";
import { isConnected } from "@/lib/integrations/google-health";
import { syncGoogleHealth } from "@/lib/integrations/sync";

/** Daily Vercel cron — authenticates with CRON_SECRET, not a session. */
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
