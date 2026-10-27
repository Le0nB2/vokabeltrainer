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
          if (typeof prisma?.user?.findUnique !== 'function') {
            return {
              id: payload.id,
              username: payload.u,
              role: payload.role || "USER",
            }
          }
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
          // User was deleted or deactivated: reject session
          return null
        } catch (err) {
          // Fail-Secure: Do not grant access if DB verification fails
          console.warn("[Auth] Database error verifying user session:", err)
          return null
        }
      } else if (payload.id === "admin" || (authUser && payload.u === authUser)) {
        return {
          id: payload.id || "admin",
          username: payload.u,
          role: payload.role || "ADMIN",
        }
      } else if (!isConfigured && payload.id === "default") {
        return {
          id: "default",
          username: "default",
          role: "ADMIN",
        }
      }
    }
  }

  // If auth is not configured in env, allow single-user setup mode ONLY IF no DB users exist
  if (!isConfigured) {
    try {
      if (typeof prisma?.user?.count !== 'function') {
        return {
          id: "default",
          username: "default",
          role: "ADMIN",
        }
      }
      const dbUserCount = await prisma.user.count()
      if (dbUserCount === 0) {
        return {
          id: "default",
          username: "default",
          role: "ADMIN",
        }
      }
    } catch (err) {
      // Fail-Secure: Do not grant default admin on database errors
      console.warn("[Auth] Database error checking user count, failing secure:", err)
      return null
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
