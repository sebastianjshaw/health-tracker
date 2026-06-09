import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { exchangeCode } from "@/lib/integrations/google-health";

const STATE_COOKIE = "gh_oauth_state";

/** Google OAuth redirect target: verify state, exchange code, store tokens. */
export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  if (params.get("error") || !code || !state || !expected || state !== expected) {
    return NextResponse.redirect(new URL("/settings?error=google-auth", request.url));
  }

  const redirectUri = new URL("/api/integrations/google/callback", request.url).toString();
  const ok = await exchangeCode(code, redirectUri);
  return NextResponse.redirect(
    new URL(ok ? "/settings?connected=google" : "/settings?error=google-token", request.url),
  );
}
