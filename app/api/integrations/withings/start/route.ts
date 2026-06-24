import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { authUrl, isConfigured } from "@/lib/integrations/withings";

const STATE_COOKIE = "withings_oauth_state";

/** Kick off Withings OAuth: set a CSRF state cookie, redirect to consent. */
export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (!isConfigured()) {
    return NextResponse.redirect(new URL("/settings?error=withings-not-configured", request.url));
  }

  const state = crypto.randomUUID();
  const redirectUri = new URL("/api/integrations/withings/callback", request.url).toString();

  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(authUrl(state, redirectUri));
}
