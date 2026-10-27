"use server"
import {
  AUTH_COOKIE_MAX_AGE,
  AUTH_COOKIE_NAME,
  SETTINGS_COOKIE_MAX_AGE,
  SETTINGS_COOKIE_NAME,
  createAppSessionToken,
  createSettingsSessionToken,
  getAppAuthCredentials,
  getAppSecret,
  isSecureRequest,
  secureCompare,
  verifyPassword,
} from "@/lib/auth-utils"
import prisma from "@/lib/prisma"
import {
  checkRateLimit,
  recordRateLimitFailure,
  resetRateLimit,
  formatRetryDuration,
  getClientIpFromHeaders,
} from "@/lib/rate-limit"

import { cookies, headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { createHash, timingSafeEqual } from "crypto"

async function getClientIp(): Promise<string> {
  try {
    const headersList = await headers()
    return getClientIpFromHeaders(headersList)
  } catch {
    // headers() might not be available in certain contexts
  }
  return "127.0.0.1"
}

export async function checkPassword(password: string) {
  const envPassword = process.env.SETTINGS_PASSWORD

  if (!envPassword) {
    return { success: true }
  }

  const clientIp = await getClientIp()
  const rateLimitKey = `settings:${clientIp}`
  const rateLimit = checkRateLimit(rateLimitKey)
  if (rateLimit.isBlocked) {
    return {
      success: false,
      error: `Zu viele Fehlversuche. Bitte versuche es in ${formatRetryDuration(rateLimit.retryAfterSeconds)} erneut.`,
    }
  }

  const hashInput = createHash("sha256").update(password).digest()
  const hashEnv = createHash("sha256").update(envPassword).digest()
  const isMatch = timingSafeEqual(hashInput, hashEnv)

  if (isMatch) {
    resetRateLimit(rateLimitKey)
    const headersList = await headers()
    const isSecure = isSecureRequest(headersList)
    const cookieStore = await cookies()
    cookieStore.set(SETTINGS_COOKIE_NAME, createSettingsSessionToken(envPassword, SETTINGS_COOKIE_MAX_AGE), {
      httpOnly: true,
      secure: isSecure,
      path: "/",
      sameSite: "lax",
      maxAge: SETTINGS_COOKIE_MAX_AGE,
    })
    revalidatePath("/settings")
    return { success: true }
  }

  recordRateLimitFailure(rateLimitKey)

  // Add slight delay to mitigate high-speed brute-force attacks
  await new Promise((resolve) => setTimeout(resolve, 500))
  return { success: false, error: "Falsches Passwort" }
}

export async function loginApp(credentials: { username?: string; password?: string }) {
  const { user: envUser, password: envPassword, isConfigured } = getAppAuthCredentials()

  if (!isConfigured) {
    try {
      const count = await prisma.user.count()
      if (count === 0) {
        return { success: true }
      }
    } catch {
      return { success: true }
    }
  }

  const clientIp = await getClientIp()
  const ipKey = `login:ip:${clientIp}`
  const ipRateLimit = checkRateLimit(ipKey, { maxAttempts: 5, windowMs: 15 * 60 * 1000, blockDurationMs: 15 * 60 * 1000 })
  if (ipRateLimit.isBlocked) {
    return {
      success: false,
      error: `Zu viele Fehlversuche. Bitte versuche es in ${formatRetryDuration(ipRateLimit.retryAfterSeconds)} erneut.`,
    }
  }

  const username = (credentials.username || "").trim()
  const password = credentials.password || ""

  // Account-level rate limiting (max 10 failures per username across all IPs in 15 min window)
  const userKey = username ? `login:user:${username.toLowerCase()}` : null
  if (userKey) {
    const userRateLimit = checkRateLimit(userKey, { maxAttempts: 10, windowMs: 15 * 60 * 1000, blockDurationMs: 15 * 60 * 1000 })
    if (userRateLimit.isBlocked) {
      return {
        success: false,
        error: `Zu viele Fehlversuche für diesen Benutzer. Bitte versuche es in ${formatRetryDuration(userRateLimit.retryAfterSeconds)} erneut.`,
      }
    }
  }

  // Global rate limit against distributed brute force / password spraying (max 50 attempts in 15 min)
  const globalKey = "login:global"
  const globalRateLimit = checkRateLimit(globalKey, { maxAttempts: 50, windowMs: 15 * 60 * 1000, blockDurationMs: 15 * 60 * 1000 })
  if (globalRateLimit.isBlocked) {
    return {
      success: false,
      error: `Zu viele fehlerhafte Anmeldeversuche. Bitte versuche es in ${formatRetryDuration(globalRateLimit.retryAfterSeconds)} erneut.`,
    }
  }

  // 1. Check against Environment User (Admin from Render env)
  let authenticatedUser: { id: string; username: string; role: string } | null = null

  if (isConfigured && envUser && envPassword && secureCompare(username, envUser) && secureCompare(password, envPassword)) {
    authenticatedUser = { id: "admin", username: envUser, role: "ADMIN" }
  } else {
    // 2. Check against Database Users
    try {
      const dbUser = await prisma.user.findUnique({
        where: { username },
      })
      if (dbUser && dbUser.passwordHash) {
        if (verifyPassword(password, dbUser.passwordHash)) {
          if (!dbUser.isActive) {
            return { success: false, error: "Dieser Benutzeraccount wurde deaktiviert." }
          }
          authenticatedUser = {
            id: dbUser.id,
            username: dbUser.username,
            role: dbUser.role || "USER",
          }
          // Asynchronously update lastLoginAt
          prisma.user
            .update({
              where: { id: dbUser.id },
              data: { lastLoginAt: new Date() },
            })
            .catch(() => {})
        }
      }
    } catch {
      // ignore db errors in rate limiting context
    }
  }

  if (authenticatedUser) {
    resetRateLimit(ipKey)
    if (userKey) {
      resetRateLimit(userKey)
    }
    const headersList = await headers()
    const isSecure = isSecureRequest(headersList)
    const cookieStore = await cookies()
    const secret = getAppSecret(envPassword)
    const token = createAppSessionToken(authenticatedUser.username, secret, AUTH_COOKIE_MAX_AGE, {
      id: authenticatedUser.id,
      role: authenticatedUser.role,
    })

    cookieStore.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isSecure,
      path: "/",
      sameSite: "lax",
      maxAge: AUTH_COOKIE_MAX_AGE,
    })

    return { success: true }
  }

  recordRateLimitFailure(ipKey, { maxAttempts: 5, windowMs: 15 * 60 * 1000, blockDurationMs: 15 * 60 * 1000 })
  if (userKey) {
    recordRateLimitFailure(userKey, { maxAttempts: 10, windowMs: 15 * 60 * 1000, blockDurationMs: 15 * 60 * 1000 })
  }
  recordRateLimitFailure(globalKey, { maxAttempts: 50, windowMs: 15 * 60 * 1000, blockDurationMs: 15 * 60 * 1000 })

  // Delay to mitigate brute force
  await new Promise((resolve) => setTimeout(resolve, 500))
  return { success: false, error: "Ungültiger Benutzername oder falsches Passwort" }
}

export async function logoutApp() {
  const headersList = await headers()
  const isSecure = isSecureRequest(headersList)
  const cookieStore = await cookies()
  cookieStore.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  cookieStore.set(SETTINGS_COOKIE_NAME, "", {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  return { success: true }
}

export async function logoutSettings() {
  const headersList = await headers()
  const isSecure = isSecureRequest(headersList)
  const cookieStore = await cookies()
  cookieStore.set(SETTINGS_COOKIE_NAME, "", {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  revalidatePath("/settings")
  return { success: true }
}

export async function isSettingsPasswordConfigured() {
  return Boolean(process.env.SETTINGS_PASSWORD)
}

export async function isAppAuthRequired() {
  const { isConfigured } = getAppAuthCredentials()
  if (isConfigured) return true
  try {
    const count = await prisma.user.count()
    return count > 0
  } catch {
    return false
  }
}

