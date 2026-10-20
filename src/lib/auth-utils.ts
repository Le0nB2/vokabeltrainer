import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto"

export { getSafeRedirectUrl } from "./utils/url"

export const AUTH_COOKIE_NAME = "auth_session"
export const AUTH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

export const SETTINGS_COOKIE_NAME = "settings_auth"
export const SETTINGS_COOKIE_MAX_AGE = 24 * 60 * 60 // 1 day in seconds

declare global {
  var __vokabeltrainer_fallback_secret: string | undefined
  var __vokabeltrainer_warned_secret: boolean | undefined
}

/**
 * Generate or retrieve an in-memory random 256-bit secret when no explicit secret is configured.
 */
export function getFallbackSecret(): string {
  if (!globalThis.__vokabeltrainer_fallback_secret) {
    globalThis.__vokabeltrainer_fallback_secret = randomBytes(32).toString("hex")
    if (process.env.NODE_ENV === "production" && !globalThis.__vokabeltrainer_warned_secret) {
      globalThis.__vokabeltrainer_warned_secret = true
      console.warn(
        "[Security Warning] Neither AUTH_SECRET nor SESSION_SECRET is set in the environment. A random 256-bit secret was generated in-memory. For persistent sessions across server restarts, please configure AUTH_SECRET."
      )
    }
  }
  return globalThis.__vokabeltrainer_fallback_secret
}

/**
 * Reset in-memory fallback secret (primarily for testing purposes).
 */
export function resetFallbackSecret(): void {
  delete globalThis.__vokabeltrainer_fallback_secret
  delete globalThis.__vokabeltrainer_warned_secret
}

/**
 * Constant-time string comparison resistant to timing attacks
 */
export function secureCompare(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest()
  const hashB = createHash("sha256").update(b).digest()
  return timingSafeEqual(hashA, hashB)
}

/**
 * Determine whether a request is considered secure (HTTPS) for the purpose of setting Secure cookies.
 * Checks standard and proxy headers, origin/referer, and respects COOKIE_SECURE environment override.
 */
export function isSecureRequest(
  headersList?: { get(name: string): string | null } | Headers | null
): boolean {
  // Explicit environment override
  const envOverride = process.env.COOKIE_SECURE?.trim().toLowerCase()
  if (envOverride === "true" || envOverride === "1") return true
  if (envOverride === "false" || envOverride === "0") return false

  if (headersList) {
    // 1. X-Forwarded-Proto (standard reverse proxy header; supports comma-separated proxy list)
    const forwardedProto = headersList.get("x-forwarded-proto")
    if (forwardedProto) {
      const clientProto = forwardedProto.split(",")[0].trim().toLowerCase()
      if (clientProto === "https") return true
      if (clientProto === "http") return false
    }

    // 2. Alternative reverse proxy headers
    const forwardedSsl = headersList.get("x-forwarded-ssl")?.trim().toLowerCase()
    if (forwardedSsl === "on" || forwardedSsl === "1") return true

    const frontEndHttps = headersList.get("front-end-https")?.trim().toLowerCase()
    if (frontEndHttps === "on" || frontEndHttps === "yes") return true

    const xUrlScheme = headersList.get("x-url-scheme")?.trim().toLowerCase()
    if (xUrlScheme === "https") return true

    // 3. Referer or Origin headers
    const origin = headersList.get("origin")
    if (origin) {
      if (origin.startsWith("https://")) return true
      if (origin.startsWith("http://")) return false
    }

    const referer = headersList.get("referer")
    if (referer) {
      if (referer.startsWith("https://")) return true
      if (referer.startsWith("http://")) return false
    }
  }

  // 4. Default: secure in production if no unencrypted indicator was found; false in dev/test
  return process.env.NODE_ENV === "production"
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
    getFallbackSecret()
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

/**
 * Create a signed, time-limited session token for /settings access:
 * <base64url(payload)>.<hmacSha256(payload, secret)>
 */
export function createSettingsSessionToken(
  password: string | undefined,
  maxAgeSeconds = SETTINGS_COOKIE_MAX_AGE
): string {
  if (!password) return "unauthenticated"
  const secret = getAppSecret(password)
  const payload = JSON.stringify({
    scope: "settings",
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  })
  const data = Buffer.from(payload).toString("base64url")
  const sig = createHmac("sha256", secret).update(`settings:${data}`).digest("hex")
  return `${data}.${sig}`
}

/**
 * Verify a signed session token for /settings.
 * Returns true if password is not configured (bypass), or if token is valid, has scope "settings", and is not expired.
 */
export function verifySettingsSessionToken(
  token: string | undefined | null,
  password: string | undefined
): boolean {
  if (!password) return true // If no password is set, authentication is bypassed
  if (!token || typeof token !== "string") return false

  const parts = token.split(".")
  if (parts.length !== 2) return false

  const [data, sig] = parts
  if (!data || !sig) return false

  const secret = getAppSecret(password)
  const expectedSig = createHmac("sha256", secret).update(`settings:${data}`).digest("hex")
  if (sig.length !== expectedSig.length) return false
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return false

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf-8"))
    if (typeof payload !== "object" || payload === null) return false
    if (payload.scope !== "settings") return false
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return false
    }
    return true
  } catch {
    return false
  }
}

// Backward compatibility helpers for /settings password layout
export const getSessionCookieValue = createSettingsSessionToken
export const verifySessionCookie = verifySettingsSessionToken

