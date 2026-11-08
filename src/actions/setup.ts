"use server"

import fs from "fs"
import path from "path"
import prisma, { getRuntimeDbUrl, reloadPrismaClient } from "@/lib/prisma"
import { decryptSecret } from "@/lib/security/crypto"
import {
  getAppAuthCredentials,
  getAppSecret,
  createAppSessionToken,
  getPasswordVersion,
  validateUsername,
  validatePasswordPolicy,
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE,
  SETTINGS_COOKIE_NAME,
  SETTINGS_COOKIE_MAX_AGE,
  createSettingsSessionToken,
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
  isRender: boolean
  databaseNeedsSetup: boolean
}> {
  const isRender = Boolean(process.env.RENDER)
  const isPublicOrRender = Boolean(
    process.env.RENDER ||
    process.env.IS_PUBLIC ||
    (process.env.NODE_ENV === "production" && !process.env.DOCKER_LOCAL)
  )

  let runtimeDbUrl = getRuntimeDbUrl()

  // If not found in env or runtime-db.json, try restoring from encrypted cookie
  if (!runtimeDbUrl) {
    try {
      const cookieStore = await cookies()
      const encryptedCookie = cookieStore.get("runtime_db_url")?.value
      if (encryptedCookie) {
        const decrypted = decryptSecret(encryptedCookie)
        if (
          decrypted &&
          (decrypted.startsWith("postgresql://") || decrypted.startsWith("postgres://"))
        ) {
          runtimeDbUrl = decrypted
          process.env.DATABASE_URL = decrypted
          reloadPrismaClient(decrypted)

          try {
            const configPath = path.join(process.cwd(), "prisma", "runtime-db.json")
            const configDir = path.dirname(configPath)
            if (!fs.existsSync(configDir)) {
              fs.mkdirSync(configDir, { recursive: true })
            }
            fs.writeFileSync(
              configPath,
              JSON.stringify(
                {
                  databaseType: "postgres",
                  databaseUrl: decrypted,
                  restoredFromCookieAt: new Date().toISOString(),
                },
                null,
                2
              ),
              "utf8"
            )
          } catch {
            // ignore file write errors
          }
        }
      }
    } catch {
      // ignore cookie errors
    }
  }

  // If running on Render without configured database, database setup is required
  if (isRender && !runtimeDbUrl) {
    return {
      needsSetup: true,
      isPublicOrRender,
      isRender,
      databaseNeedsSetup: true,
    }
  }

  const { isConfigured } = getAppAuthCredentials()
  if (isConfigured) {
    return { needsSetup: false, isPublicOrRender, isRender, databaseNeedsSetup: false }
  }

  try {
    const adminCount = await prisma.user.count({
      where: { role: "ADMIN" },
    })
    if (adminCount > 0) {
      return { needsSetup: false, isPublicOrRender, isRender, databaseNeedsSetup: false }
    }

    const settings = await prisma.settings.findUnique({
      where: { id: "default" },
    })
    if (settings?.isSetupCompleted) {
      return { needsSetup: false, isPublicOrRender, isRender, databaseNeedsSetup: false }
    }

    const userCount = await prisma.user.count()
    if (userCount > 0) {
      return { needsSetup: false, isPublicOrRender, isRender, databaseNeedsSetup: false }
    }

    return { needsSetup: true, isPublicOrRender, isRender, databaseNeedsSetup: false }
  } catch (err: unknown) {
    console.error("Error checking setup state:", err)
    return {
      needsSetup: true,
      isPublicOrRender,
      isRender,
      databaseNeedsSetup: true,
    }
  }
}

export async function completeSetupSingleUser(params?: {
  settingsPin?: string
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
      error: `Zu viele Anfragen. Bitte versuche es in ${formatRetryDuration(rateLimit.retryAfterSeconds)} erneut.`,
    }
  }

  let settingsPasswordHash: string | null = null
  if (params?.settingsPin && params.settingsPin.trim().length > 0) {
    const cleanPin = params.settingsPin.trim()
    if (cleanPin.length < 4) {
      return { success: false, error: "Die Einstellungs-PIN muss mindestens 4 Zeichen lang sein." }
    }
    if (cleanPin.length > 128) {
      return { success: false, error: "Die Einstellungs-PIN darf maximal 128 Zeichen lang sein." }
    }
    settingsPasswordHash = hashPassword(cleanPin)
  }

  try {
    await prisma.$transaction(async (tx) => {
      const adminCount = await tx.user.count({ where: { role: "ADMIN" } })
      if (adminCount > 0) {
        throw new Error("SETUP_ALREADY_COMPLETED")
      }
      const settings = await tx.settings.findUnique({ where: { id: "default" } })
      if (settings?.isSetupCompleted) {
        throw new Error("SETUP_ALREADY_COMPLETED")
      }

      await tx.settings.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          isSetupCompleted: true,
          ...(settingsPasswordHash ? { settingsPasswordHash } : {}),
        },
        update: {
          isSetupCompleted: true,
          ...(settingsPasswordHash ? { settingsPasswordHash } : {}),
        },
      })
    })

    // Establish clean single-user session and remove any stale cookies
    const headersList = await headers()
    const isSecure = isSecureRequest(headersList)
    const cookieStore = await cookies()
    const secret = getAppSecret()
    const token = createAppSessionToken("default", secret, AUTH_COOKIE_MAX_AGE, {
      id: "default",
      role: "ADMIN",
    })

    cookieStore.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isSecure,
      path: "/",
      sameSite: "lax",
      maxAge: AUTH_COOKIE_MAX_AGE,
    })

    if (settingsPasswordHash && settingsPasswordHash !== "disabled") {
      cookieStore.set(SETTINGS_COOKIE_NAME, createSettingsSessionToken(settingsPasswordHash, SETTINGS_COOKIE_MAX_AGE), {
        httpOnly: true,
        secure: isSecure,
        path: "/",
        sameSite: "lax",
        maxAge: SETTINGS_COOKIE_MAX_AGE,
      })
    } else {
      cookieStore.set(SETTINGS_COOKIE_NAME, "", {
        httpOnly: true,
        secure: isSecure,
        path: "/",
        sameSite: "lax",
        maxAge: 0,
      })
    }

    resetRateLimit(rateLimitKey)
    revalidatePath("/")
    revalidatePath("/settings")
    return { success: true }
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "SETUP_ALREADY_COMPLETED") {
      return { success: false, error: "Die Ersteinrichtung wurde bereits abgeschlossen." }
    }
    recordRateLimitFailure(rateLimitKey, { maxAttempts: 5, windowMs: 15 * 60 * 1000, blockDurationMs: 15 * 60 * 1000 })
    console.error("Error completing single-user setup:", err)
    return { success: false, error: "Fehler beim Speichern der Einstellungen." }
  }
}

export interface ChildAccountSetupInput {
  username: string
  displayName?: string
  password: string
}

export async function completeSetupProtected(params: {
  username: string
  password: string
  settingsPin?: string
  settingsOption?: "same" | "pin" | "none"
  customPin?: string
  createChild?: boolean
  childAccount?: ChildAccountSetupInput
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

  const cleanUsername = (userValidation.normalized || params.username.trim()).toLowerCase()
  const password = params.password

  // Validate Child Account if requested
  let cleanChildUsername: string | null = null
  let childDisplayName: string | null = null
  let childPassword = ""

  if (params.createChild && params.childAccount) {
    const childUserVal = validateUsername(params.childAccount.username)
    if (!childUserVal.valid) {
      return { success: false, error: `Kinder-Konto: ${childUserVal.error}` }
    }
    const childPassVal = validatePasswordPolicy(params.childAccount.password)
    if (!childPassVal.valid) {
      return { success: false, error: `Kinder-Konto: ${childPassVal.error}` }
    }

    cleanChildUsername = (childUserVal.normalized || params.childAccount.username.trim()).toLowerCase()
    childDisplayName = params.childAccount.displayName?.trim() || params.childAccount.username.trim()
    childPassword = params.childAccount.password

    if (cleanUsername === cleanChildUsername) {
      return { success: false, error: "Eltern-Konto und Kinder-Konto müssen unterschiedliche Benutzernamen haben." }
    }
  }

  let settingsPasswordHash: string | null = null
  if (params.settingsPin !== undefined) {
    const cleanPin = params.settingsPin.trim()
    if (cleanPin.length > 0) {
      if (cleanPin.length < 4) {
        return { success: false, error: "Die Einstellungs-PIN muss mindestens 4 Zeichen lang sein." }
      }
      if (cleanPin.length > 128) {
        return { success: false, error: "Die Einstellungs-PIN darf maximal 128 Zeichen lang sein." }
      }
      settingsPasswordHash = hashPassword(cleanPin)
    } else {
      settingsPasswordHash = "disabled"
    }
  } else if (params.settingsOption === "same") {
    settingsPasswordHash = hashPassword(password)
  } else if (params.settingsOption === "pin") {
    if (!params.customPin || params.customPin.trim().length < 4) {
      return { success: false, error: "Der PIN muss mindestens 4 Zeichen lang sein." }
    }
    if (params.customPin.length > 128) {
      return { success: false, error: "Der PIN darf maximal 128 Zeichen lang sein." }
    }
    settingsPasswordHash = hashPassword(params.customPin.trim())
  } else if (params.settingsOption === "none") {
    settingsPasswordHash = "disabled"
  } else {
    // Default fallback
    settingsPasswordHash = hashPassword(password)
  }

  try {
    // Atomically create admin, optional child, assign decks, and update settings with race condition protection
    const user = await prisma.$transaction(async (tx) => {
      const adminCount = await tx.user.count({ where: { role: "ADMIN" } })
      if (adminCount > 0) {
        throw new Error("SETUP_ALREADY_COMPLETED")
      }
      const existingSettings = await tx.settings.findUnique({ where: { id: "default" } })
      if (existingSettings?.isSetupCompleted) {
        throw new Error("SETUP_ALREADY_COMPLETED")
      }

      const existing = await tx.user.findFirst({
        where: {
          OR: [
            { username: cleanUsername },
            { username: params.username.trim() },
          ],
        },
      })
      if (existing) {
        throw new Error("USERNAME_TAKEN")
      }

      if (cleanChildUsername) {
        const existingChild = await tx.user.findFirst({
          where: {
            OR: [
              { username: cleanChildUsername },
              { username: params.childAccount!.username.trim() },
            ],
          },
        })
        if (existingChild) {
          throw new Error("CHILD_USERNAME_TAKEN")
        }
      }

      const passwordHash = hashPassword(password)

      const newUser = await tx.user.create({
        data: {
          username: cleanUsername,
          displayName: params.username.trim(),
          passwordHash,
          role: "ADMIN",
          isActive: true,
        },
      })

      // Optionally create child account
      let newChildUser = null
      if (cleanChildUsername && childPassword) {
        newChildUser = await tx.user.create({
          data: {
            username: cleanChildUsername,
            displayName: childDisplayName || cleanChildUsername,
            passwordHash: hashPassword(childPassword),
            role: "USER",
            isActive: true,
          },
        })
      }

      // Reassign existing unassigned decks: if child was created, assign to child (learning user), else to admin
      const targetDeckUserId = newChildUser ? newChildUser.id : newUser.id
      await tx.deck.updateMany({
        where: {
          OR: [{ userId: null }, { userId: "default" }, { userId: "admin" }],
        },
        data: {
          userId: targetDeckUserId,
        },
      })

      // Update settings with completion flag and settings password hash
      await tx.settings.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          isSetupCompleted: true,
          ...(settingsPasswordHash ? { settingsPasswordHash } : {}),
        },
        update: {
          isSetupCompleted: true,
          ...(settingsPasswordHash ? { settingsPasswordHash } : {}),
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

    if (settingsPasswordHash && settingsPasswordHash !== "disabled") {
      cookieStore.set(SETTINGS_COOKIE_NAME, createSettingsSessionToken(settingsPasswordHash, SETTINGS_COOKIE_MAX_AGE), {
        httpOnly: true,
        secure: isSecure,
        path: "/",
        sameSite: "lax",
        maxAge: SETTINGS_COOKIE_MAX_AGE,
      })
    }

    resetRateLimit(rateLimitKey)
    revalidatePath("/")
    revalidatePath("/settings")
    return { success: true }
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === "SETUP_ALREADY_COMPLETED") {
        return { success: false, error: "Die Ersteinrichtung wurde bereits abgeschlossen." }
      }
      if (err.message === "USERNAME_TAKEN") {
        return { success: false, error: `Der Benutzername "${params.username.trim()}" ist bereits vergeben.` }
      }
      if (err.message === "CHILD_USERNAME_TAKEN") {
        return {
          success: false,
          error: `Der Benutzername "${params.childAccount?.username.trim()}" für das Kinder-Profil ist bereits vergeben.`,
        }
      }
    }
    recordRateLimitFailure(rateLimitKey, { maxAttempts: 5, windowMs: 15 * 60 * 1000, blockDurationMs: 15 * 60 * 1000 })
    console.error("Error completing protected setup:", err)
    return { success: false, error: "Unerwarteter Fehler beim Einrichten des Kontos." }
  }
}
