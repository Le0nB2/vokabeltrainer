import { createHash, createHmac, timingSafeEqual } from "crypto"

export { getSafeRedirectUrl } from "./utils/url"

export const AUTH_COOKIE_NAME = "auth_session"
export const AUTH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

/**
 * Constant-time string comparison resistant to timing attacks
 */
export function secureCompare(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest()
  const hashB = createHash("sha256").update(b).digest()
  return timingSafeEqual(hashA, hashB)
}

/**
 * Retrieve configured credentials from environment variables.
 * Supports AUTH_USER / AUTH_PASSWORD with fallback to BASIC_AUTH_USER / BASIC_AUTH_PASSWORD.
 */
export function getAppAuthCredentials() {
  const user = process.env.AUTH_USER || process.env.BASIC_AUTH_USER || ""
  const password = process.env.AUTH_PASSWORD || process.env.BASIC_AUTH_PASSWORD || ""
  const isConfigured = Boolean(user && password)

  return {
    user,
    password,
    isConfigured,
  }
}

/**
 * Secret used for HMAC session token signing.
 */
export function getAppSecret(password?: string): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.SESSION_SECRET ||
    password ||
    "vokabeltrainer-session-secret"
  )
}

/**
 * Create a signed session token: <base64url(payload)>.<hmacSha256(payload, secret)>
 */
export function createAppSessionToken(
  username: string,
  secret: string,
  maxAgeSeconds = AUTH_COOKIE_MAX_AGE
): string {
  const payload = JSON.stringify({
    u: username,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  })
  const data = Buffer.from(payload).toString("base64url")
  const sig = createHmac("sha256", secret).update(data).digest("hex")
  return `${data}.${sig}`
}

/**
 * Verify a signed session token. Returns true if valid, matching the expected user, and not expired.
 */
export function verifyAppSessionToken(
  token: string | undefined | null,
  expectedUser: string,
  secret: string
): boolean {
  if (!token || typeof token !== "string") return false
  const parts = token.split(".")
  if (parts.length !== 2) return false

  const [data, sig] = parts
  if (!data || !sig) return false

  const expectedSig = createHmac("sha256", secret).update(data).digest("hex")
  if (sig.length !== expectedSig.length) return false
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return false

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf-8"))
    if (typeof payload !== "object" || payload === null) return false
    if (expectedUser && payload.u !== expectedUser) return false
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return false
    }
    return true
  } catch {
    return false
  }
}

// Backward compatibility helpers for /settings password layout
export function getSessionCookieValue(password: string | undefined): string {
  if (!password) return "unauthenticated"
  return createHmac("sha256", password)
    .update("settings_session")
    .digest("hex")
}

export function verifySessionCookie(cookieValue: string | undefined, password: string | undefined): boolean {
  if (!password) return true // If no password is set, authentication is bypassed
  if (!cookieValue) return false

  const expectedValue = getSessionCookieValue(password)

  if (cookieValue.length !== expectedValue.length) return false

  return timingSafeEqual(
    Buffer.from(cookieValue),
    Buffer.from(expectedValue)
  )
}

