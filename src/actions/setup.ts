"use server"

import prisma from "@/lib/prisma"
import {
  getAppAuthCredentials,
  getAppSecret,
  createAppSessionToken,
  getPasswordVersion,
  validateUsername,
  validatePasswordPolicy,
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE,
  hashPassword,
  isSecureRequest,
} from "@/lib/auth-utils"
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
    return "127.0.0.1"
  }
}

export async function getSetupState(): Promise<{
  needsSetup: boolean
  isPublicOrRender: boolean
}> {
  const { isConfigured } = getAppAuthCredentials()
  const isPublicOrRender = Boolean(
    process.env.RENDER ||
    process.env.IS_PUBLIC ||
    (process.env.NODE_ENV === "production" && !process.env.DOCKER_LOCAL)
  )

  // 1. If environment credentials are configured, setup is already done (backwards compatibility)
  if (isConfigured) {
    return { needsSetup: false, isPublicOrRender }
  }

  try {
    // 2. Check if an admin user already exists in the database
    const adminCount = await prisma.user.count({
      where: { role: "ADMIN" },
    })
    if (adminCount > 0) {
      return { needsSetup: false, isPublicOrRender }
    }

    // 3. Check if setup was explicitly completed in settings (e.g. single user mode chosen)
    const settings = await prisma.settings.findUnique({
      where: { id: "default" },
    })
    if (settings?.isSetupCompleted) {
      return { needsSetup: false, isPublicOrRender }
    }

    // 4. Also check if any users exist at all
    const userCount = await prisma.user.count()
    if (userCount > 0) {
      return { needsSetup: false, isPublicOrRender }
    }

    return { needsSetup: true, isPublicOrRender }
  } catch (err) {
    console.error("Error checking setup state:", err)
    return { needsSetup: false, isPublicOrRender }
  }
}

export async function completeSetupSingleUser(): Promise<{ success: boolean; error?: string }> {
  const setupState = await getSetupState()
  if (!setupState.needsSetup) {
    return { success: false, error: "Die Ersteinrichtung wurde bereits abgeschlossen." }
  }

  const clientIp = await getClientIp()
  const rateLimitKey = `setup:ip:${clientIp}`
  const rateLimit = checkRateLimit(rateLimitKey, { maxAttempts: 5, windowMs: 15 * 60 * 1000, blockDurationMs: 15 * 60 * 1000 })
  if (rateLimit.isBlocked) {
    return {
      success: false,
      error: `Zu viele Anfragen. Bitte versuche es in ${formatRetryDuration(rateLimit.retryAfterSeconds)} erneut.`,
    }
  }

  try {
    await prisma.settings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        isSetupCompleted: true,
      },
      update: {
        isSetupCompleted: true,
      },
    })

    resetRateLimit(rateLimitKey)
    revalidatePath("/")
    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    recordRateLimitFailure(rateLimitKey, { maxAttempts: 5, windowMs: 15 * 60 * 1000, blockDurationMs: 15 * 60 * 1000 })
    console.error("Error completing single-user setup:", err)
    return { success: false, error: "Fehler beim Speichern der Einstellungen." }
  }
}

export async function completeSetupProtected(params: {
  username: string
  password: string
  settingsOption: "same" | "pin" | "none"
  customPin?: string
}): Promise<{ success: boolean; error?: string }> {
  const setupState = await getSetupState()
  if (!setupState.needsSetup) {
    return { success: false, error: "Die Ersteinrichtung wurde bereits abgeschlossen." }
  }

  const clientIp = await getClientIp()
  const rateLimitKey = `setup:ip:${clientIp}`
  const rateLimit = checkRateLimit(rateLimitKey, { maxAttempts: 5, windowMs: 15 * 60 * 1000, blockDurationMs: 15 * 60 * 1000 })
  if (rateLimit.isBlocked) {
    return {
      success: false,
      error: `Zu viele Versuche. Bitte versuche es in ${formatRetryDuration(rateLimit.retryAfterSeconds)} erneut.`,
    }
  }

  const userValidation = validateUsername(params.username)
  if (!userValidation.valid) {
    return { success: false, error: userValidation.error }
  }

  const passValidation = validatePasswordPolicy(params.password)
  if (!passValidation.valid) {
    return { success: false, error: passValidation.error }
  }

  const username = params.username.trim()
  const password = params.password

  let settingsPasswordHash: string | null = null
  if (params.settingsOption === "same") {
    settingsPasswordHash = hashPassword(password)
  } else if (params.settingsOption === "pin") {
    if (!params.customPin || params.customPin.trim().length < 4) {
      return { success: false, error: "Der PIN muss mindestens 4 Zeichen lang sein." }
    }
    settingsPasswordHash = hashPassword(params.customPin.trim())
  } else if (params.settingsOption === "none") {
    settingsPasswordHash = "disabled"
  }

  try {
    const existing = await prisma.user.findUnique({ where: { username } })
    if (existing) {
      return { success: false, error: `Der Benutzername "${username}" ist bereits vergeben.` }
    }

    const passwordHash = hashPassword(password)

    // Atomically create admin, assign decks, and update settings
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          username,
          displayName: null,
          passwordHash,
          role: "ADMIN",
          isActive: true,
        },
      })

      // Reassign existing unassigned decks to this primary admin
      await tx.deck.updateMany({
        where: {
          OR: [{ userId: null }, { userId: "default" }, { userId: "admin" }],
        },
        data: {
          userId: newUser.id,
        },
      })

      // Update settings with completion flag and settings password hash
      await tx.settings.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          isSetupCompleted: true,
          settingsPasswordHash,
        },
        update: {
          isSetupCompleted: true,
          settingsPasswordHash,
        },
      })

      return newUser
    })

    // Create session cookie so the user is directly logged in
    const headersList = await headers()
    const isSecure = isSecureRequest(headersList)
    const cookieStore = await cookies()
    const secret = getAppSecret()
    const token = createAppSessionToken(user.username, secret, AUTH_COOKIE_MAX_AGE, {
      id: user.id,
      role: user.role,
      pv: getPasswordVersion(user.passwordHash),
    })

    cookieStore.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isSecure,
      path: "/",
      sameSite: "lax",
      maxAge: AUTH_COOKIE_MAX_AGE,
    })

    resetRateLimit(rateLimitKey)
    revalidatePath("/")
    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    recordRateLimitFailure(rateLimitKey, { maxAttempts: 5, windowMs: 15 * 60 * 1000, blockDurationMs: 15 * 60 * 1000 })
    console.error("Error completing protected setup:", err)
    return { success: false, error: "Unerwarteter Fehler beim Einrichten des Kontos." }
  }
}
