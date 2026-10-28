import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_COOKIE_NAME,
  SETTINGS_COOKIE_NAME,
  getAppAuthCredentials,
  getAppSecret,
  decodeAppSessionToken,
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
  const sessionPayload = decodeAppSessionToken(sessionCookie, secret);
  const isEnvUser = authUser ? sessionPayload?.u === authUser : false;
  const isDbUser = Boolean(sessionPayload?.id && sessionPayload?.id !== "admin");
  const isAuthenticated = Boolean(
    sessionPayload && (!authUser || isEnvUser || isDbUser)
  );

  // Helper: auto-clear settings session cookie when navigating outside /settings
  const applySettingsAutoLogout = (response: any) => {
    if (
      pathname !== "/settings" &&
      !pathname.startsWith("/api/export") &&
      !pathname.startsWith("/api/worksheet")
    ) {
      const rawCookie = req.headers?.get("cookie");
      const hasSettingsCookie = Boolean(
        req.cookies?.get(SETTINGS_COOKIE_NAME)?.value ||
        (rawCookie && rawCookie.includes(`${SETTINGS_COOKIE_NAME}=`))
      );
      if (hasSettingsCookie && response && typeof response.cookies?.set === "function") {
        response.cookies.set(SETTINGS_COOKIE_NAME, "", {
          path: "/",
          maxAge: 0,
        });
      }
    }
    return response;
  };

  // Explicit session clearing when arriving at /login?clear=1 (e.g. from stale session detection)
  if (pathname === "/login" && url.searchParams.get("clear") === "1") {
    const res = NextResponse.next();
    res.cookies.set(AUTH_COOKIE_NAME, "", { path: "/", maxAge: 0 });
    res.cookies.set(SETTINGS_COOKIE_NAME, "", { path: "/", maxAge: 0 });
    return applySettingsAutoLogout(res);
  }

  // Authenticated user
  if (isAuthenticated) {
    // Only redirect away from /login if authenticated via environment credentials.
    // For database users, Server Component /login verifies DB existence to avoid infinite redirect loops with stale cookies.
    if (pathname === "/login" && isEnvUser) {
      const redirectTarget = url.searchParams.get("redirect");
      const safeTarget = getSafeRedirectUrl(redirectTarget, "/");
      const finalTarget = safeTarget === "/login" ? "/" : safeTarget;
      const targetUrl = new URL(finalTarget, url.origin);
      return applySettingsAutoLogout(NextResponse.redirect(targetUrl));
    }
    return applySettingsAutoLogout(NextResponse.next());
  }

  // Home Assistant / Notification API token access
  if (pathname === "/api/notifications/due-count") {
    const token = extractTokenFromRequest(req.headers, url.searchParams);
    if (verifyNotificationToken(token)) {
      return NextResponse.next();
    }
  }

  // Automatically clear stale auth cookies when visiting /setup (e.g. after database reset)
  if (pathname === "/setup") {
    const rawCookie = req.headers?.get("cookie");
    const hasAuthCookie = Boolean(
      req.cookies?.get(AUTH_COOKIE_NAME)?.value ||
      (rawCookie && rawCookie.includes(`${AUTH_COOKIE_NAME}=`))
    );
    const res = applySettingsAutoLogout(NextResponse.next());
    if (hasAuthCookie) {
      res.cookies.set(AUTH_COOKIE_NAME, "", { path: "/", maxAge: 0 });
    }
    return res;
  }

  // Unauthenticated user:
  // Allow access to login page, setup page, static icons, and app manifest
  if (
    pathname === "/login" ||
    pathname === "/setup" ||
    pathname === "/apple-icon" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/apple-touch-icon-precomposed.png" ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/icon.png" ||
    pathname === "/icon-192.png" ||
    pathname === "/icon-512.png" ||
    /^\/icon-\d+x\d+\.png$/.test(pathname)
  ) {
    return applySettingsAutoLogout(NextResponse.next());
  }

  // If env credentials are NOT configured, allow request to proceed to server components.
  // Next.js server components / actions (via getCurrentUser) enforce authentication if DB users exist.
  if (!isConfigured) {
    return applySettingsAutoLogout(NextResponse.next());
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

