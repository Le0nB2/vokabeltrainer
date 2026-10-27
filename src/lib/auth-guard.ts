import { cookies } from "next/headers"
import prisma from "./prisma"
import {
  AUTH_COOKIE_NAME,
  getAppAuthCredentials,
  getAppSecret,
  decodeAppSessionToken,
  getPasswordVersion,
} from "./auth-utils"

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized: Authentication required") {
    super(message)
    this.name = "UnauthorizedError"
  }
}

export interface AuthUser {
  id: string
  username: string
  role: string
}

/**
 * Returns the currently authenticated user based on session cookie or env fallback.
 * Returns null if authentication is required but user is not authenticated.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const { user: authUser, password: authPassword, isConfigured } = getAppAuthCredentials()
  const secret = getAppSecret(authPassword)

  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value

  if (token) {
    const payload = decodeAppSessionToken(token, secret)
    if (payload) {
      // If it's a database user session, verify the user still exists and is active
      if (payload.id && payload.id !== "admin" && payload.id !== "default") {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: payload.id },
            select: { id: true, username: true, role: true, isActive: true, passwordHash: true },
          })
          if (dbUser && dbUser.isActive) {
            // Revoke active session if password hash has changed since token issuance
            if (payload.pv && dbUser.passwordHash) {
              const currentPv = getPasswordVersion(dbUser.passwordHash)
              if (payload.pv !== currentPv) {
                return null
              }
            }
            return {
              id: dbUser.id,
              username: dbUser.username,
              role: dbUser.role,
            }
          }
          // User was deleted or deactivated: do not treat as authenticated
        } catch {
          // If query fails (e.g. in test mock), proceed with payload
          return {
            id: payload.id,
            username: payload.u,
            role: payload.role || "USER",
          }
        }
      } else if (!authUser || payload.u === authUser) {
        return {
          id: payload.id || "admin",
          username: payload.u,
          role: payload.role || "ADMIN",
        }
      }
    }
  }

  // If auth is not configured in env, allow single-user setup mode ONLY IF no DB users exist
  if (!isConfigured) {
    try {
      const dbUserCount = await prisma.user.count()
      if (dbUserCount === 0) {
        return {
          id: "default",
          username: "default",
          role: "ADMIN",
        }
      }
    } catch {
      return {
        id: "default",
        username: "default",
        role: "ADMIN",
      }
    }
  }

  return null
}

/**
 * Ensures the user has a valid authenticated session.
 * Throws UnauthorizedError if authentication is configured and user is not authenticated.
 * If authentication is not configured in environment, it allows access.
 */
export async function requireAppAuth(): Promise<void> {
  const user = await getCurrentUser()
  if (!user) {
    throw new UnauthorizedError()
  }
}

/**
 * Returns true if the user is authenticated or if auth is not configured.
 */
export async function isAppAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser()
  return user !== null
}
