import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { authUrl, isConfigured } from "@/lib/integrations/google-health";

const STATE_COOKIE = "gh_oauth_state";

/** Kick off Google Health OAuth: set a CSRF state cookie, redirect to consent. */
export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (!isConfigured()) {
    return NextResponse.redirect(new URL("/settings?error=not-configured", request.url));
  }

  const state = crypto.randomUUID();
  const redirectUri = new URL("/api/integrations/google/callback", request.url).toString();

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
