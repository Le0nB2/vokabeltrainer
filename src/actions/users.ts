"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { cookies, headers } from "next/headers"
import {
  SETTINGS_COOKIE_NAME,
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE,
  getAppAuthCredentials,
  getAppSecret,
  createAppSessionToken,
  isSecureRequest,
  hashPassword,
} from "@/lib/auth-utils"
import { requireAppAuth } from "@/lib/auth-guard"
import { checkSettingsAuthenticated } from "@/actions/auth"

const checkSettingsAuth = checkSettingsAuthenticated

export interface UserSummary {
  id: string
  username: string
  displayName?: string | null
  role: string
  isActive: boolean
  isEnvUser: boolean
  isPrimaryAdmin: boolean
  createdAt: Date
  lastLoginAt?: Date | null
  deckCount: number
}

export interface UserManagementData {
  hasPrimaryAdmin: boolean
  primaryAdminType: "env" | "db" | null
  primaryAdminUsername?: string | null
  isEnvConfigured: boolean
  users: UserSummary[]
}

export async function getUserManagementData(): Promise<UserManagementData> {
  await requireAppAuth()
  const isAuth = await checkSettingsAuth()
  if (!isAuth) {
    throw new Error("Nicht autorisiert. Bitte melde dich mit dem Einstellungspasswort an.")
  }

  const { user: envUser, isConfigured } = getAppAuthCredentials()

  const dbUsers = await prisma.user.findMany({
    include: {
      _count: {
        select: { decks: true },
      },
    },
    orderBy: { createdAt: "asc" },
  })

  const users: UserSummary[] = []
  let hasPrimaryAdmin = false
  let primaryAdminType: "env" | "db" | null = null
  let primaryAdminUsername: string | null = null

  // 1. If configured in Environment, the Environment user is the Super-Admin
  if (isConfigured && envUser) {
    hasPrimaryAdmin = true
    primaryAdminType = "env"
    primaryAdminUsername = envUser

    const envDeckCount = await prisma.deck.count({
      where: {
        OR: [{ userId: "admin" }, { userId: null }, { userId: "default" }],
      },
    })

    users.push({
      id: "env-admin",
      username: envUser,
      displayName: null,
      role: "ADMIN",
      isActive: true,
      isEnvUser: true,
      isPrimaryAdmin: true,
      createdAt: new Date(2026, 0, 1),
      lastLoginAt: null,
      deckCount: envDeckCount,
    })
  }

  // 2. Process database users
  let dbAdminAssigned = false
  for (const u of dbUsers) {
    const isDbAdmin = u.role === "ADMIN"
    const isPrimary = !isConfigured && isDbAdmin && !dbAdminAssigned
    if (isPrimary) {
      dbAdminAssigned = true
      hasPrimaryAdmin = true
      primaryAdminType = "db"
      primaryAdminUsername = u.username
    }

    // If this DB user is the primary admin and there are unassigned legacy decks, count them
    let extraDecks = 0
    if (isPrimary) {
      extraDecks = await prisma.deck.count({
        where: {
          OR: [{ userId: null }, { userId: "default" }],
        },
      })
    }

    users.push({
      id: u.id,
      username: u.username,
      displayName: u.displayName || (isPrimary ? "Hauptnutzer" : null),
      role: u.role,
      isActive: u.isActive,
      isEnvUser: false,
      isPrimaryAdmin: isPrimary,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      deckCount: u._count.decks + extraDecks,
    })
  }

  // Sort so primary admin is always first
  users.sort((a, b) => {
    if (a.isPrimaryAdmin) return -1
    if (b.isPrimaryAdmin) return 1
    return 0
  })

  return {
    hasPrimaryAdmin,
    primaryAdminType,
    primaryAdminUsername,
    isEnvConfigured: isConfigured,
    users,
  }
}

export async function getUsers(): Promise<UserSummary[]> {
  const data = await getUserManagementData()
  return data.users
}

/**
 * Creates the primary admin (Hauptnutzer) directly via settings when
 * no environment variables (AUTH_USER / AUTH_PASSWORD) are set.
 * Automatically transfers any existing unassigned decks to this admin
 * and logs the admin in.
 */
export async function setupPrimaryAdmin(data: {
  username: string
  password: string
}) {
  await requireAppAuth()
  const isAuth = await checkSettingsAuth()
  if (!isAuth) {
    return { success: false, error: "Nicht autorisiert. Bitte melde dich mit dem Einstellungspasswort an." }
  }

  const { isConfigured } = getAppAuthCredentials()
  if (isConfigured) {
    return { success: false, error: "Ein Hauptnutzer ist bereits über die Server-Umgebungsvariablen konfiguriert." }
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  })
  if (existingAdmin) {
    return { success: false, error: "Es ist bereits ein Hauptnutzer in der Datenbank eingerichtet." }
  }

  const cleanUsername = (data.username || "").trim().toLowerCase()
  const cleanPassword = data.password || ""

  if (!cleanUsername || cleanUsername.length < 2 || cleanUsername.length > 50) {
    return { success: false, error: "Der Benutzername muss zwischen 2 und 50 Zeichen lang sein." }
  }

  if (!/^[a-zA-Z0-9_\-\.]+$/.test(cleanUsername)) {
    return { success: false, error: "Der Benutzername darf nur Buchstaben, Zahlen, Bindestriche und Punkte enthalten." }
  }

  if (cleanUsername === "default") {
    return { success: false, error: "Dieser Benutzername ist reserviert." }
  }

  if (!cleanPassword || cleanPassword.length < 6) {
    return { success: false, error: "Das Passwort muss mindestens 6 Zeichen lang sein." }
  }

  const passwordHash = hashPassword(cleanPassword)

  const existingUser = await prisma.user.findUnique({
    where: { username: cleanUsername },
  })

  // 1. Create primary admin or promote existing user
  let newAdmin: any
  if (existingUser) {
    newAdmin = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        role: "ADMIN",
        passwordHash,
        isActive: true,
      },
    })
  } else {
    newAdmin = await prisma.user.create({
      data: {
        username: cleanUsername,
        displayName: "Hauptnutzer",
        passwordHash,
        role: "ADMIN",
        isActive: true,
      },
    })
  }

  // 2. Transfer all existing unassigned decks to this new Hauptnutzer
  await prisma.deck.updateMany({
    where: {
      OR: [{ userId: null }, { userId: "default" }, { userId: "admin" }],
    },
    data: {
      userId: newAdmin.id,
    },
  })

  // 3. Set session cookie so the administrator is immediately logged in
  try {
    const secret = getAppSecret()
    const token = createAppSessionToken(newAdmin.username, secret, AUTH_COOKIE_MAX_AGE, {
      id: newAdmin.id,
      role: newAdmin.role,
    })
    const cookieStore = await cookies()
    const headersList = await headers()
    const isSecure = isSecureRequest(headersList)
    cookieStore.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isSecure,
      path: "/",
      sameSite: "lax",
      maxAge: AUTH_COOKIE_MAX_AGE,
    })
  } catch {
    // Graceful fallback in test or headless environments
  }

  revalidatePath("/settings")
  revalidatePath("/")
  return { success: true, userId: newAdmin.id }
}

export async function createUser(data: {
  username: string
  password: string
  displayName?: string
}) {
  await requireAppAuth()
  const isAuth = await checkSettingsAuth()
  if (!isAuth) {
    return { success: false, error: "Nicht autorisiert. Bitte melde dich mit dem Einstellungspasswort an." }
  }

  // Ensure a primary admin exists first!
  const mgmtData = await getUserManagementData()
  if (!mgmtData.hasPrimaryAdmin) {
    return {
      success: false,
      error: "Bitte richte zuerst den Hauptnutzer ein, bevor weitere Benutzer angelegt werden können.",
    }
  }

  const cleanUsername = (data.username || "").trim()
  const cleanPassword = data.password || ""
  const cleanDisplayName = data.displayName?.trim() || null

  if (!cleanUsername || cleanUsername.length < 2 || cleanUsername.length > 50) {
    return { success: false, error: "Der Benutzername muss zwischen 2 und 50 Zeichen lang sein." }
  }

  if (!/^[a-zA-Z0-9_\-\.]+$/.test(cleanUsername)) {
    return { success: false, error: "Der Benutzername darf nur Buchstaben, Zahlen, Bindestriche und Punkte enthalten." }
  }

  if (cleanUsername.toLowerCase() === "default") {
    return { success: false, error: "Dieser Benutzername ist reserviert." }
  }

  if (!cleanPassword || cleanPassword.length < 4) {
    return { success: false, error: "Das Passwort muss mindestens 4 Zeichen lang sein." }
  }

  const { user: envUser } = getAppAuthCredentials()
  if (envUser && cleanUsername.toLowerCase() === envUser.toLowerCase()) {
    return { success: false, error: "Dieser Benutzername ist für den System-Administrator reserviert." }
  }

  const existingUser = await prisma.user.findUnique({
    where: { username: cleanUsername },
  })

  if (existingUser) {
    return { success: false, error: "Ein Benutzer mit diesem Benutzernamen existiert bereits." }
  }

  const passwordHash = hashPassword(cleanPassword)

  const newUser = await prisma.user.create({
    data: {
      username: cleanUsername,
      displayName: cleanDisplayName,
      passwordHash,
      role: "USER",
      isActive: true,
    },
  })

  revalidatePath("/settings")
  return { success: true, userId: newUser.id }
}

export async function deleteUser(userId: string) {
  await requireAppAuth()
  const isAuth = await checkSettingsAuth()
  if (!isAuth) {
    return { success: false, error: "Nicht autorisiert. Bitte melde dich mit dem Einstellungspasswort an." }
  }

  if (userId === "env-admin" || userId === "admin") {
    return { success: false, error: "Der Hauptnutzer kann nicht gelöscht werden." }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user) {
    return { success: false, error: "Benutzer nicht gefunden." }
  }

  if (user.role === "ADMIN") {
    return { success: false, error: "Der Hauptnutzer kann nicht gelöscht werden." }
  }

  await prisma.user.delete({
    where: { id: userId },
  })

  revalidatePath("/settings")
  return { success: true }
}

export async function resetUserPassword(userId: string, newPassword: string) {
  await requireAppAuth()
  const isAuth = await checkSettingsAuth()
  if (!isAuth) {
    return { success: false, error: "Nicht autorisiert. Bitte melde dich mit dem Einstellungspasswort an." }
  }

  if (userId === "env-admin") {
    return {
      success: false,
      error: "Das Passwort des Server-Administrators wird über die Render / Docker-Umgebungsvariablen verwaltet.",
    }
  }

  const cleanPassword = newPassword || ""
  if (cleanPassword.length < 4) {
    return { success: false, error: "Das Passwort muss mindestens 4 Zeichen lang sein." }
  }

  const passwordHash = hashPassword(cleanPassword)

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  })

  revalidatePath("/settings")
  return { success: true }
}

export async function toggleUserActive(userId: string) {
  await requireAppAuth()
  const isAuth = await checkSettingsAuth()
  if (!isAuth) {
    return { success: false, error: "Nicht autorisiert. Bitte melde dich mit dem Einstellungspasswort an." }
  }

  if (userId === "env-admin") {
    return { success: false, error: "Der Hauptnutzer kann nicht deaktiviert werden." }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user) {
    return { success: false, error: "Benutzer nicht gefunden." }
  }

  if (user.role === "ADMIN") {
    return { success: false, error: "Der Hauptnutzer kann nicht deaktiviert werden." }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: !user.isActive },
  })

  revalidatePath("/settings")
  return { success: true }
}
