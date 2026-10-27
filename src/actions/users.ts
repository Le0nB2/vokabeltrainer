"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import {
  verifySettingsSessionToken,
  SETTINGS_COOKIE_NAME,
  getAppAuthCredentials,
  hashPassword,
} from "@/lib/auth-utils"
import { requireAppAuth } from "@/lib/auth-guard"

async function checkSettingsAuth(): Promise<boolean> {
  const envPassword = process.env.SETTINGS_PASSWORD
  if (!envPassword) return true
  const cookieStore = await cookies()
  return verifySettingsSessionToken(cookieStore.get(SETTINGS_COOKIE_NAME)?.value, envPassword)
}

export interface UserSummary {
  id: string
  username: string
  displayName?: string | null
  role: string
  isActive: boolean
  isEnvUser: boolean
  createdAt: Date
  lastLoginAt?: Date | null
  deckCount: number
}

export async function getUsers(): Promise<UserSummary[]> {
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

  // Add primary Environment User if configured
  if (isConfigured && envUser) {
    // Count unassigned legacy decks or decks assigned to "admin"
    const envDeckCount = await prisma.deck.count({
      where: {
        OR: [{ userId: "admin" }, { userId: null }],
      },
    })

    users.push({
      id: "env-admin",
      username: envUser,
      displayName: "System-Administrator",
      role: "ADMIN",
      isActive: true,
      isEnvUser: true,
      createdAt: new Date(2026, 0, 1),
      lastLoginAt: null,
      deckCount: envDeckCount,
    })
  }

  for (const u of dbUsers) {
    users.push({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      isActive: u.isActive,
      isEnvUser: false,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      deckCount: u._count.decks,
    })
  }

  return users
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

  const cleanUsername = (data.username || "").trim()
  const cleanPassword = data.password || ""
  const cleanDisplayName = data.displayName?.trim() || null

  if (!cleanUsername || cleanUsername.length < 2 || cleanUsername.length > 50) {
    return { success: false, error: "Der Benutzername muss zwischen 2 und 50 Zeichen lang sein." }
  }

  if (!/^[a-zA-Z0-9_\-\.]+$/.test(cleanUsername)) {
    return { success: false, error: "Der Benutzername darf nur Buchstaben, Zahlen, Bindestriche und Punkte enthalten." }
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
    return { success: false, error: "Der System-Administrator kann nicht gelöscht werden." }
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
    return { success: false, error: "Das Passwort des System-Administrators wird über die Render-Umgebungsvariablen verwaltet." }
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
    return { success: false, error: "Der System-Administrator kann nicht deaktiviert werden." }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user) {
    return { success: false, error: "Benutzer nicht gefunden." }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: !user.isActive },
  })

  revalidatePath("/settings")
  return { success: true }
}
