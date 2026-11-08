import { NextRequest, NextResponse } from "next/server"
import { randomBytes, createHash } from "crypto"

export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get("returnTo") || "/settings"
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000"
  const proto = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https")
  const callbackUrl = `${proto}://${host}/api/auth/openrouter/callback`

  const codeVerifier = randomBytes(32).toString("base64url")
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url")

  const targetUrl = new URL("https://openrouter.ai/auth")
  targetUrl.searchParams.set("callback_url", callbackUrl)
  targetUrl.searchParams.set("code_challenge", codeChallenge)
  targetUrl.searchParams.set("code_challenge_method", "S256")

  const response = NextResponse.redirect(targetUrl.toString())
  const isSecure = proto === "https"

  response.cookies.set("or_code_verifier", codeVerifier, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 minutes
  })

  response.cookies.set("or_return_to", returnTo, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  })

  return response
}
