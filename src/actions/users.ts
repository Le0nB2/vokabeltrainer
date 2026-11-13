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
  getPasswordVersion,
  validateUsername,
  validatePasswordPolicy,
  isSecureRequest,
  hashPassword,
} from "@/lib/auth-utils"
import { requireAppAuth, getCurrentUser } from "@/lib/auth-guard"
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

  const userValidation = validateUsername(data.username)
  if (!userValidation.valid) {
    return { success: false, error: userValidation.error }
  }

  const passValidation = validatePasswordPolicy(data.password)
  if (!passValidation.valid) {
    return { success: false, error: passValidation.error }
  }

  const cleanUsername = data.username.trim().toLowerCase()
  const cleanPassword = data.password
  const passwordHash = hashPassword(cleanPassword)

  const existingUser = await prisma.user.findUnique({
    where: { username: cleanUsername },
  })

  // 1. Atomically create primary admin / promote and transfer existing unassigned decks
  const newAdmin = await prisma.$transaction(async (tx) => {
    let adminRecord: any
    if (existingUser) {
      adminRecord = await tx.user.update({
        where: { id: existingUser.id },
        data: {
          role: "ADMIN",
          passwordHash,
          isActive: true,
        },
      })
    } else {
      adminRecord = await tx.user.create({
        data: {
          username: cleanUsername,
          displayName: "Hauptnutzer",
          passwordHash,
          role: "ADMIN",
          isActive: true,
        },
      })
    }

    await tx.deck.updateMany({
      where: {
        OR: [{ userId: null }, { userId: "default" }, { userId: "admin" }],
      },
      data: {
        userId: adminRecord.id,
      },
    })

    return adminRecord
  })

  // 2. Set session cookie so the administrator is immediately logged in
  try {
    const secret = getAppSecret()
    const token = createAppSessionToken(newAdmin.username, secret, AUTH_COOKIE_MAX_AGE, {
      id: newAdmin.id,
      role: newAdmin.role,
      pv: getPasswordVersion(newAdmin.passwordHash),
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

export async function setupFamilySystem(data: {
  parentUsername: string
  parentPassword: string
  childUsername: string
  childPassword: string
  childDisplayName?: string
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

  // Validate Parent Credentials
  const parentUserVal = validateUsername(data.parentUsername)
  if (!parentUserVal.valid) {
    return { success: false, error: `Eltern-Konto: ${parentUserVal.error}` }
  }
  const parentPassVal = validatePasswordPolicy(data.parentPassword)
  if (!parentPassVal.valid) {
    return { success: false, error: `Eltern-Konto: ${parentPassVal.error}` }
  }

  // Validate Child Credentials
  const childUserVal = validateUsername(data.childUsername)
  if (!childUserVal.valid) {
    return { success: false, error: `Kinder-Profil: ${childUserVal.error}` }
  }
  const childPassVal = validatePasswordPolicy(data.childPassword)
  if (!childPassVal.valid) {
    return { success: false, error: `Kinder-Profil: ${childPassVal.error}` }
  }

  const cleanParentUsername = data.parentUsername.trim().toLowerCase()
  const cleanChildUsername = data.childUsername.trim().toLowerCase()

  if (cleanParentUsername === cleanChildUsername) {
    return { success: false, error: "Eltern-Konto und Kinder-Profil müssen unterschiedliche Benutzernamen haben." }
  }

  const existingUsers = await prisma.user.findMany({
    where: {
      username: { in: [cleanParentUsername, cleanChildUsername] },
    },
  })
  if (existingUsers.length > 0) {
    return { success: false, error: "Einer der gewählten Benutzernamen existiert bereits." }
  }

  const parentHash = hashPassword(data.parentPassword)
  const childHash = hashPassword(data.childPassword)

  // Atomically create Parent Admin, Child User, and reassign all existing unassigned decks to Child!
  const result = await prisma.$transaction(async (tx) => {
    const parent = await tx.user.create({
      data: {
        username: cleanParentUsername,
        displayName: "Eltern",
        passwordHash: parentHash,
        role: "ADMIN",
        isActive: true,
      },
    })

    const child = await tx.user.create({
      data: {
        username: cleanChildUsername,
        displayName: data.childDisplayName?.trim() || data.childUsername.trim(),
        passwordHash: childHash,
        role: "USER",
        isActive: true,
      },
    })

    // Assign all existing decks to the CHILD profile so that their learning progress stays with the child!
    await tx.deck.updateMany({
      where: {
        OR: [{ userId: null }, { userId: "default" }, { userId: "admin" }],
      },
      data: {
        userId: child.id,
      },
    })

    // Also update settings password hash to the parent password if not yet configured,
    // ensuring the parent is the master of settings
    const settings = await tx.settings.findUnique({ where: { id: "default" } })
    if (!settings || !settings.settingsPasswordHash || settings.settingsPasswordHash === "disabled") {
      await tx.settings.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          isSetupCompleted: true,
          settingsPasswordHash: parentHash,
        },
        update: {
          isSetupCompleted: true,
          settingsPasswordHash: parentHash,
        },
      })
    }

    return { parent, child }
  })

  // Set session cookie for the parent admin so they remain logged in
  try {
    const secret = getAppSecret()
    const token = createAppSessionToken(result.parent.username, secret, AUTH_COOKIE_MAX_AGE, {
      id: result.parent.id,
      role: result.parent.role,
      pv: getPasswordVersion(result.parent.passwordHash),
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
  return {
    success: true,
    parentId: result.parent.id,
    childId: result.child.id,
  }
}

export async function convertSingleUserToFamily(data: {
  parentUsername: string
  parentPassword: string
  secondChildUsername: string
  secondChildPassword: string
  secondChildDisplayName?: string
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

  // Find the single existing user/admin in the database
  const existingAdmins = await prisma.user.findMany({
    where: { role: "ADMIN" },
  })
  if (existingAdmins.length === 0) {
    return { success: false, error: "Kein bisheriger Hauptnutzer in der Datenbank gefunden." }
  }
  const previousUser = existingAdmins[0]

  // Validate Parent Credentials
  const parentUserVal = validateUsername(data.parentUsername)
  if (!parentUserVal.valid) {
    return { success: false, error: `Eltern-Konto: ${parentUserVal.error}` }
  }
  const parentPassVal = validatePasswordPolicy(data.parentPassword)
  if (!parentPassVal.valid) {
    return { success: false, error: `Eltern-Konto: ${parentPassVal.error}` }
  }

  // Validate Second Child Credentials
  const childUserVal = validateUsername(data.secondChildUsername)
  if (!childUserVal.valid) {
    return { success: false, error: `Zweites Kind: ${childUserVal.error}` }
  }
  const childPassVal = validatePasswordPolicy(data.secondChildPassword)
  if (!childPassVal.valid) {
    return { success: false, error: `Zweites Kind: ${childPassVal.error}` }
  }

  const cleanParentUsername = data.parentUsername.trim().toLowerCase()
  const cleanSecondChildUsername = data.secondChildUsername.trim().toLowerCase()

  if (cleanParentUsername === cleanSecondChildUsername) {
    return { success: false, error: "Eltern-Konto und zweites Kind müssen unterschiedliche Benutzernamen haben." }
  }

  if (cleanParentUsername === previousUser.username.toLowerCase()) {
    return { success: false, error: `Der Benutzername "${previousUser.username}" wird bereits vom bisherigen Profil verwendet.` }
  }

  if (cleanSecondChildUsername === previousUser.username.toLowerCase()) {
    return { success: false, error: `Der Benutzername "${previousUser.username}" wird bereits vom bisherigen Profil verwendet.` }
  }

  const existingUsers = await prisma.user.findMany({
    where: {
      username: { in: [cleanParentUsername, cleanSecondChildUsername] },
    },
  })
  if (existingUsers.length > 0) {
    return { success: false, error: "Einer der gewählten Benutzernamen existiert bereits." }
  }

  const parentHash = hashPassword(data.parentPassword)
  const secondChildHash = hashPassword(data.secondChildPassword)

  // Atomically:
  // 1. Create parent as ADMIN
  // 2. Downgrade previousUser to USER (their decks stay completely intact with their userId!)
  // 3. Create second child as USER
  // 4. Update settings password hash to parent's password
  const result = await prisma.$transaction(async (tx) => {
    const parent = await tx.user.create({
      data: {
        username: cleanParentUsername,
        displayName: "Eltern",
        passwordHash: parentHash,
        role: "ADMIN",
        isActive: true,
      },
    })

    const updatedPreviousUser = await tx.user.update({
      where: { id: previousUser.id },
      data: { role: "USER" },
    })

    const secondChild = await tx.user.create({
      data: {
        username: cleanSecondChildUsername,
        displayName: data.secondChildDisplayName?.trim() || data.secondChildUsername.trim(),
        passwordHash: secondChildHash,
        role: "USER",
        isActive: true,
      },
    })

    await tx.settings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        isSetupCompleted: true,
        settingsPasswordHash: parentHash,
      },
      update: {
        isSetupCompleted: true,
        settingsPasswordHash: parentHash,
      },
    })

    return { parent, updatedPreviousUser, secondChild }
  })

  // Set session cookie for the new parent admin so they are logged in as admin
  try {
    const secret = getAppSecret()
    const token = createAppSessionToken(result.parent.username, secret, AUTH_COOKIE_MAX_AGE, {
      id: result.parent.id,
      role: result.parent.role,
      pv: getPasswordVersion(result.parent.passwordHash),
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
  return {
    success: true,
    parentId: result.parent.id,
    previousUserId: result.updatedPreviousUser.id,
    secondChildId: result.secondChild.id,
  }
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

  const userValidation = validateUsername(data.username)
  if (!userValidation.valid) {
    return { success: false, error: userValidation.error }
  }

  const passValidation = validatePasswordPolicy(data.password)
  if (!passValidation.valid) {
    return { success: false, error: passValidation.error }
  }

  const cleanUsername = (userValidation.normalized || data.username.trim()).toLowerCase()
  const cleanPassword = data.password
  const cleanDisplayName = data.displayName?.trim() || data.username.trim() || null

  const { user: envUser } = getAppAuthCredentials()
  if (envUser && cleanUsername === envUser.toLowerCase()) {
    return { success: false, error: "Dieser Benutzername ist für den System-Administrator reserviert." }
  }

  let existingUser = await prisma.user.findUnique({
    where: { username: cleanUsername },
  })
  if (!existingUser && data.username.trim() !== cleanUsername) {
    existingUser = await prisma.user.findUnique({
      where: { username: data.username.trim() },
    })
  }

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

  const passValidation = validatePasswordPolicy(newPassword)
  if (!passValidation.valid) {
    return { success: false, error: passValidation.error }
  }

  const cleanPassword = newPassword
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

export async function changeUserRole(userId: string, newRole: "ADMIN" | "USER") {
  await requireAppAuth()
  const isAuth = await checkSettingsAuth()
  if (!isAuth) {
    return { success: false, error: "Nicht autorisiert. Bitte melde dich mit dem Einstellungspasswort an." }
  }

  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== "ADMIN") {
    return { success: false, error: "Nur Administratoren können Rollen verwalten." }
  }

  if (userId === "env-admin" || userId === "default" || userId === "admin") {
    return { success: false, error: "Die Rolle des System-Administrators kann nicht geändert werden." }
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
  })
  if (!targetUser) {
    return { success: false, error: "Benutzer nicht gefunden." }
  }

  if (targetUser.role === newRole) {
    return { success: true }
  }

  // If demoting to USER, ensure there is at least one OTHER active ADMIN in DB or env
  if (newRole === "USER") {
    const { isConfigured } = getAppAuthCredentials()
    if (!isConfigured) {
      const otherAdmins = await prisma.user.count({
        where: {
          role: "ADMIN",
          isActive: true,
          id: { not: userId },
        },
      })
      if (otherAdmins === 0) {
        return {
          success: false,
          error: "Es muss mindestens ein aktives Eltern-/Administratorkonto im System verbleiben.",
        }
      }
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role: newRole },
  })

  revalidatePath("/settings")
  revalidatePath("/")
  return { success: true }
}
