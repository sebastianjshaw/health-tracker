import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, isValidToken } from "@/lib/session";

// Next.js 16: "Proxy" replaces "Middleware". Runs on the edge runtime.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Cron sync authenticates itself with CRON_SECRET (no session cookie).
  if (pathname.startsWith("/api/cron/")) return NextResponse.next();

  const isLogin = pathname === "/login";
  const valid = await isValidToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (!valid && !isLogin) {
    // API routes should get a real 401, not an HTML login redirect.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  if (valid && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except static assets and the PWA manifest/icons.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|.*\\.(?:png|svg|jpg|jpeg|webp)$).*)",
  ],
};
