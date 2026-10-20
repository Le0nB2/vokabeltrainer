import { cookies } from "next/headers"
import {
  AUTH_COOKIE_NAME,
  getAppAuthCredentials,
  getAppSecret,
  verifyAppSessionToken,
} from "./auth-utils"

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized: Authentication required") {
    super(message)
    this.name = "UnauthorizedError"
  }
}

/**
 * Ensures the user has a valid authenticated session.
 * Throws UnauthorizedError if authentication is configured and user is not authenticated.
 * If authentication is not configured in environment, it allows access.
 */
export async function requireAppAuth(): Promise<void> {
  const { user: authUser, password: authPassword, isConfigured } = getAppAuthCredentials()
  if (!isConfigured) {
    return // Auth bypassed if not configured in environment
  }

  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value
  const secret = getAppSecret(authPassword)
  const isValid = verifyAppSessionToken(token, authUser, secret)

  if (!isValid) {
    throw new UnauthorizedError()
  }
}

/**
 * Returns true if the user is authenticated or if auth is not configured.
 */
export async function isAppAuthenticated(): Promise<boolean> {
  const { user: authUser, password: authPassword, isConfigured } = getAppAuthCredentials()
  if (!isConfigured) {
    return true
  }

  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value
  const secret = getAppSecret(authPassword)
  return verifyAppSessionToken(token, authUser, secret)
}
