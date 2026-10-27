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
  hashPassword,
  isSecureRequest,
  secureCompare,
  verifyPassword,
  verifySettingsSessionToken,
} from "@/lib/auth-utils"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth-guard"
import {
  checkRateLimit,
  recordRateLimitFailure,
  resetRateLimit,
  formatRetryDuration,
  getClientIpFromHeaders,
} from "@/lib/rate-limit"

import { cookies, headers } from "next/headers"
import { revalidatePath } from "next/cache"

async function getClientIp(): Promise<string> {
  try {
    const headersList = await headers()
    return getClientIpFromHeaders(headersList)
  } catch {
    // headers() might not be available in certain contexts
  }
  return "127.0.0.1"
}

export async function getSettingsProtection(): Promise<{
  isProtected: boolean
  dbHash: string | null
  envPassword: string | null
}> {
  let dbHash: string | null = null
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: "default" },
      select: { settingsPasswordHash: true },
    })
    dbHash = settings?.settingsPasswordHash ?? null
  } catch {
    // DB error fallback
  }

  // If explicitly disabled in DB, settings are not protected
  if (dbHash === "disabled") {
    return { isProtected: false, dbHash, envPassword: null }
  }

  // If a valid hash exists in DB, it takes priority over env
  if (dbHash && dbHash.length > 0) {
    return { isProtected: true, dbHash, envPassword: null }
  }

  // Fallback to environment variable if no DB setting exists
  const envPassword = process.env.SETTINGS_PASSWORD || null
  return {
    isProtected: Boolean(envPassword),
    dbHash: null,
    envPassword,
  }
}

export async function checkSettingsAuthenticated(): Promise<boolean> {
  const protection = await getSettingsProtection()
  if (!protection.isProtected) {
    return true
  }
  const cookieStore = await cookies()
  const token = cookieStore.get(SETTINGS_COOKIE_NAME)?.value
  const secretKey = protection.dbHash || protection.envPassword || undefined
  return verifySettingsSessionToken(token, secretKey)
}

export async function checkPassword(password: string) {
  const protection = await getSettingsProtection()

  if (!protection.isProtected) {
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

  let isMatch = false

  // 1. Check against DB settingsPasswordHash if present
  if (protection.dbHash) {
    isMatch = verifyPassword(password, protection.dbHash)
  } else if (protection.envPassword) {
    // 2. Check against env SETTINGS_PASSWORD
    isMatch = secureCompare(password, protection.envPassword)
  }

  // 3. Fallback: Emergency unlock with parent / admin password
  if (!isMatch) {
    try {
      const currentUser = await getCurrentUser()
      if (currentUser && currentUser.role === "ADMIN" && currentUser.id !== "default" && currentUser.id !== "admin") {
        const dbAdmin = await prisma.user.findUnique({ where: { id: currentUser.id } })
        if (dbAdmin?.passwordHash && verifyPassword(password, dbAdmin.passwordHash)) {
          isMatch = true
        }
      }
      if (!isMatch) {
        const admins = await prisma.user.findMany({
          where: { role: "ADMIN", isActive: true },
          select: { passwordHash: true },
        })
        for (const admin of admins) {
          if (admin.passwordHash && verifyPassword(password, admin.passwordHash)) {
            isMatch = true
            break
          }
        }
      }
      if (!isMatch) {
        const { password: envAdminPassword, isConfigured } = getAppAuthCredentials()
        if (isConfigured && envAdminPassword && secureCompare(password, envAdminPassword)) {
          isMatch = true
        }
      }
    } catch {
      // Ignore user check errors
    }
  }

  if (isMatch) {
    resetRateLimit(rateLimitKey)
    const headersList = await headers()
    const isSecure = isSecureRequest(headersList)
    const cookieStore = await cookies()
    const secretKey = protection.dbHash || protection.envPassword || undefined
    cookieStore.set(SETTINGS_COOKIE_NAME, createSettingsSessionToken(secretKey, SETTINGS_COOKIE_MAX_AGE), {
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

export async function updateSettingsPasswordAction(params: {
  action: "change" | "disable"
  newPassword?: string
}): Promise<{ success: boolean; error?: string }> {
  const isAuth = await checkSettingsAuthenticated()
  if (!isAuth) {
    return { success: false, error: "Nicht autorisiert. Bitte melde dich mit dem Einstellungspasswort an." }
  }

  try {
    if (params.action === "disable") {
      await prisma.settings.upsert({
        where: { id: "default" },
        create: { id: "default", settingsPasswordHash: "disabled", isSetupCompleted: true },
        update: { settingsPasswordHash: "disabled" },
      })
      const headersList = await headers()
      const isSecure = isSecureRequest(headersList)
      const cookieStore = await cookies()
      cookieStore.set(SETTINGS_COOKIE_NAME, "", {
        httpOnly: true,
        secure: isSecure,
        path: "/",
        sameSite: "lax",
        maxAge: 0,
      })
      revalidatePath("/settings")
      return { success: true }
    }

    if (!params.newPassword || params.newPassword.trim().length < 4) {
      return { success: false, error: "Das Kennwort bzw. die PIN muss mindestens 4 Zeichen lang sein." }
    }

    const newHash = hashPassword(params.newPassword.trim())
    await prisma.settings.upsert({
      where: { id: "default" },
      create: { id: "default", settingsPasswordHash: newHash, isSetupCompleted: true },
      update: { settingsPasswordHash: newHash },
    })

    // Set new cookie with new secret key so user remains authenticated
    const headersList = await headers()
    const isSecure = isSecureRequest(headersList)
    const cookieStore = await cookies()
    cookieStore.set(SETTINGS_COOKIE_NAME, createSettingsSessionToken(newHash, SETTINGS_COOKIE_MAX_AGE), {
      httpOnly: true,
      secure: isSecure,
      path: "/",
      sameSite: "lax",
      maxAge: SETTINGS_COOKIE_MAX_AGE,
    })

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("Error updating settings password:", err)
    return { success: false, error: "Fehler beim Speichern des Einstellungspassworts." }
  }
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

  let authenticatedUser: { id: string; username: string; role: string } | null = null

  // 0. Check for emergency reset password in environment (ADMIN_PASSWORD or RESET_ADMIN_PASSWORD)
  const resetEnvPassword = process.env.RESET_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD
  if (resetEnvPassword && password && secureCompare(password, resetEnvPassword)) {
    try {
      const adminUser = await prisma.user.findFirst({
        where: username ? { username } : { role: "ADMIN" },
      })
      if (adminUser) {
        // Automatically synchronize DB hash to match this new admin password
        await prisma.user.update({
          where: { id: adminUser.id },
          data: {
            passwordHash: hashPassword(password),
            lastLoginAt: new Date(),
          },
        })
        authenticatedUser = {
          id: adminUser.id,
          username: adminUser.username,
          role: adminUser.role,
        }
      }
    } catch {
      // Fall through to regular checks
    }
  }

  // 1. Check against Environment User (Admin from Render env)
  if (!authenticatedUser && isConfigured && envUser && envPassword && secureCompare(username, envUser) && secureCompare(password, envPassword)) {
    authenticatedUser = { id: "admin", username: envUser, role: "ADMIN" }
  } else if (!authenticatedUser) {
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

export async function isSettingsPasswordConfigured(): Promise<boolean> {
  const protection = await getSettingsProtection()
  return protection.isProtected
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
