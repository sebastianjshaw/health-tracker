import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { exchangeCode, subscribeNotifications } from "@/lib/integrations/withings";

const STATE_COOKIE = "withings_oauth_state";

/** Withings OAuth redirect target: verify state, exchange code, store tokens. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");

  // Withings validates the registered URL by pinging it server-side (no OAuth
  // params, no session). Answer that reachability check with a plain 200 — no
  // token work happens without a code, so this exposes nothing.
  if (!code) {
    return NextResponse.json({ ok: true });
  }

  // A real return carries code+state; gate the token exchange on the session
  // (the user was logged in when they started the flow, so the cookie rides the
  // top-level redirect back).
  if (!(await isAuthenticated())) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  if (params.get("error") || !code || !state || !expected || state !== expected) {
    return NextResponse.redirect(new URL("/settings?error=withings-auth", request.url));
  }

  const redirectUri = new URL("/api/integrations/withings/callback", request.url).toString();
  const ok = await exchangeCode(code, redirectUri);

  // Now that we hold a token, subscribe the Notify webhook so future weigh-ins
  // push to us instantly. Best-effort — never blocks the connect on a hiccup.
  if (ok) {
    const notifyUrl = new URL("/api/integrations/withings/notify", request.url).toString();
    await subscribeNotifications(notifyUrl);
  }

  return NextResponse.redirect(
    new URL(ok ? "/settings?connected=withings" : "/settings?error=withings-token", request.url),
  );
}
