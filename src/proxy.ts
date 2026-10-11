import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const basicAuthUser = process.env.BASIC_AUTH_USER;
  const basicAuthPassword = process.env.BASIC_AUTH_PASSWORD;

  // Bypass auth if credentials are not configured in environment
  if (!basicAuthUser || !basicAuthPassword) {
    return NextResponse.next();
  }

  const basicAuth = req.headers.get("authorization");

  if (basicAuth) {
    const authValue = basicAuth.split(" ")[1];
    if (authValue) {
      try {
        const decoded = atob(authValue);
        const colonIndex = decoded.indexOf(":");

        if (colonIndex > -1) {
          const user = decoded.slice(0, colonIndex);
          const pwd = decoded.slice(colonIndex + 1);

          if (user === basicAuthUser && pwd === basicAuthPassword) {
            return NextResponse.next();
          }
        }
      } catch (e) {
        // Ignore errors (e.g. invalid base64) to fall through to 401
      }
    }
  }

  return new NextResponse("Auth required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Secure Area"',
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images in public folder like public/assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
