import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_COOKIE_NAME,
  getAppAuthCredentials,
  getAppSecret,
  verifyAppSessionToken,
  extractTokenFromRequest,
  verifyNotificationToken,
} from "./lib/auth-utils";
import { getSafeRedirectUrl } from "./lib/utils/url";

export async function proxy(req: NextRequest) {
  const { user: authUser, password: authPassword, isConfigured } = getAppAuthCredentials();
  const url = req.nextUrl
    ? new URL(req.nextUrl.toString())
    : new URL(req.url || "/", "http://localhost");
  const pathname = url.pathname;

  // Bypass auth if credentials are not configured in environment
  if (!isConfigured) {
    if (pathname === "/login") {
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Get session cookie (support both NextRequest.cookies and Cookie header fallback)
  let sessionCookie = req.cookies?.get(AUTH_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    const rawCookie = req.headers?.get("cookie");
    if (rawCookie) {
      const match = rawCookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
      if (match) {
        sessionCookie = match.slice(AUTH_COOKIE_NAME.length + 1);
      }
    }
  }

  const secret = getAppSecret(authPassword);
  const isAuthenticated = verifyAppSessionToken(sessionCookie, authUser, secret);

  // Authenticated user
  if (isAuthenticated) {
    if (pathname === "/login") {
      const redirectTarget = url.searchParams.get("redirect");
      const safeTarget = getSafeRedirectUrl(redirectTarget, "/");
      const finalTarget = safeTarget === "/login" ? "/" : safeTarget;
      const targetUrl = new URL(finalTarget, url.origin);
      return NextResponse.redirect(targetUrl);
    }
    return NextResponse.next();
  }

  // Home Assistant / Notification API token access
  if (pathname === "/api/notifications/due-count") {
    const token = extractTokenFromRequest(req.headers, url.searchParams);
    if (verifyNotificationToken(token)) {
      return NextResponse.next();
    }
  }

  // Unauthenticated user:
  // Allow access to login page, static icons, and app manifest
  if (
    pathname === "/login" ||
    pathname === "/apple-icon" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/apple-touch-icon-precomposed.png" ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/icon.png" ||
    pathname.startsWith("/icon-")
  ) {
    return NextResponse.next();
  }

  // For API routes, return 401 JSON without WWW-Authenticate: Basic header
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // For protected page routes, redirect to /login preserving the requested path
  const loginUrl = new URL("/login", url.origin);
  if (pathname !== "/") {
    loginUrl.searchParams.set("redirect", pathname + url.search);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - apple-icon / apple-touch-icon
     * - manifest.json / manifest.webmanifest
     * - images and media in public folder
     */
    "/((?!_next/static|_next/image|favicon\\.ico|apple-icon|apple-touch-icon|manifest\\.json|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};

