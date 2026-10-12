import { createHmac, timingSafeEqual } from "crypto"

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
