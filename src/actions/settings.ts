"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAppAuth, getCurrentUser, UnauthorizedError } from "@/lib/auth-guard"
import { MAX_IMPORT_SIZE_BYTES, validateBackupData } from "@/lib/validations/import"
import { checkSettingsAuthenticated } from "@/actions/auth"
import { hashPassword, validateUsername, validatePasswordPolicy } from "@/lib/auth-utils"
import { MAX_SRS_INTERVAL_DAYS } from "@/lib/constants"

const checkSettingsAuth = checkSettingsAuthenticated

export interface UserImportMapping {
  action: "create" | "assign"
  targetUserId?: string
  password?: string
  displayName?: string
}

export async function importData(
  jsonData: string,
  userMappings?: Record<string, UserImportMapping>
) {
  try {
    await requireAppAuth()
    const user = await getCurrentUser()
    const isAuth = await checkSettingsAuth()
    if (!isAuth) {
      return { success: false, error: "Nicht autorisiert. Bitte melde dich mit dem Einstellungspasswort an." }
    }

    if (typeof jsonData !== "string") {
      return { success: false, error: "Ungültige Eingabe: Erwartet wird ein JSON-String." }
    }

    if (jsonData.length > MAX_IMPORT_SIZE_BYTES) {
      return { success: false, error: "Importdatei ist zu groß (maximal 5 MB erlaubt)." }
    }

    let parsedData: unknown
    try {
      parsedData = JSON.parse(jsonData)
    } catch {
      return { success: false, error: "Ungültiges JSON-Format. Die Datei konnte nicht analysiert werden." }
    }

    const validationResult = validateBackupData(parsedData)
    if (!validationResult.success) {
      return { success: false, error: validationResult.error }
    }

    const { decks, settings } = validationResult.data

    // Fetch all active DB users for mapping
    const existingDbUsers = typeof prisma?.user?.findMany === "function"
      ? await prisma.user.findMany({
          select: { id: true, username: true, displayName: true },
        })
      : []
    const userByUsername = new Map(existingDbUsers.map((u) => [u.username.toLowerCase(), u]))
    const createdUsersMap = new Map<string, string>() // lowercase username -> newly created userId

    // Validate any users that need to be created
    if (userMappings) {
      for (const [ownerUsername, mapping] of Object.entries(userMappings)) {
        if (mapping.action === "create") {
          const userVal = validateUsername(ownerUsername)
          if (!userVal.valid) {
            return { success: false, error: `Benutzer "${ownerUsername}": ${userVal.error}` }
          }
          if (!mapping.password) {
            return { success: false, error: `Bitte gib ein Passwort für das neue Profil "${ownerUsername}" an.` }
          }
          const passVal = validatePasswordPolicy(mapping.password)
          if (!passVal.valid) {
            return { success: false, error: `Passwort für Profil "${ownerUsername}": ${passVal.error}` }
          }
        }
      }
    }

    // Only assign userId if the user is a persistent database user.
    // Synthetic users ("admin", "default", "env-admin") do not have a record in the User table,
    // which would trigger a foreign key violation (P2003 / Deck_userId_fkey) in PostgreSQL.
    const fallbackUserId =
      user &&
      user.id &&
      user.id !== "default" &&
      user.id !== "admin" &&
      user.id !== "env-admin"
        ? user.id
        : null

    // Wrap in a transaction to ensure all or nothing
    await prisma.$transaction(async (tx) => {
      // 1. Create any missing users that were requested to be created
      if (userMappings && typeof tx?.user?.findUnique === "function") {
        for (const [ownerUsername, mapping] of Object.entries(userMappings)) {
          if (mapping.action === "create" && mapping.password) {
            const cleanUsername = ownerUsername.trim().toLowerCase()
            const existing = await tx.user.findUnique({ where: { username: cleanUsername } })
            if (existing) {
              createdUsersMap.set(cleanUsername, existing.id)
            } else if (typeof tx?.user?.create === "function") {
              const newUser = await tx.user.create({
                data: {
                  username: cleanUsername,
                  displayName: mapping.displayName?.trim() || ownerUsername.trim(),
                  passwordHash: hashPassword(mapping.password),
                  role: "USER",
                  isActive: true,
                },
              })
              createdUsersMap.set(cleanUsername, newUser.id)
            }
          }
        }
      }

      // 2. Restore Settings if available (defense-in-depth: strip sensitive security fields)
      if (settings) {
        const { id, ...settingsWithoutId } = settings as Record<string, unknown>
        delete (settingsWithoutId as Record<string, unknown>).isSetupCompleted
        delete (settingsWithoutId as Record<string, unknown>).settingsPasswordHash

        await tx.settings.upsert({
          where: { id: "default" },
          update: settingsWithoutId,
          create: {
            id: "default",
            ...settingsWithoutId,
          },
        })
      }

      // 3. Create decks with their respective assigned users
      for (const deck of decks) {
        let deckTargetUserId: string | null = fallbackUserId

        const rawOwner = (deck as any).ownerUsername?.trim()?.toLowerCase()
        if (rawOwner) {
          if (createdUsersMap.has(rawOwner)) {
            deckTargetUserId = createdUsersMap.get(rawOwner)!
          } else if (userMappings?.[rawOwner]?.action === "assign" && userMappings[rawOwner].targetUserId) {
            deckTargetUserId = userMappings[rawOwner].targetUserId!
          } else if (userByUsername.has(rawOwner)) {
            deckTargetUserId = userByUsername.get(rawOwner)!.id
          }
        }

        const createdDeck = await tx.deck.create({
          data: {
            title: deck.title,
            description: deck.description ?? null,
            userId: deckTargetUserId,
            createdAt: deck.createdAt ?? undefined,
            updatedAt: deck.updatedAt ?? undefined,
            lastResultCorrect: deck.lastResultCorrect ?? null,
            lastResultIncorrect: deck.lastResultIncorrect ?? null,
          },
        })

        if (deck.cards && deck.cards.length > 0) {
          const maxDueTime = Date.now() + MAX_SRS_INTERVAL_DAYS * 24 * 60 * 60 * 1000
          for (const card of deck.cards) {
            const clampedBox = Math.min(MAX_SRS_INTERVAL_DAYS, card.box)
            const clampedDueDate = card.dueDate
              ? new Date(Math.min(card.dueDate.getTime(), maxDueTime))
              : undefined

            const createdCard = await tx.card.create({
              data: {
                deckId: createdDeck.id,
                front: card.front,
                back: card.back,
                notes: card.notes ?? null,
                mnemonic: card.mnemonic ?? null,
                contextSentence: card.contextSentence ?? null,
                easeFactor: card.easeFactor,
                lapses: card.lapses,
                box: clampedBox,
                consecutiveCorrect: card.consecutiveCorrect,
                dueDate: clampedDueDate,
                lastReviewed: card.lastReviewed ?? null,
                createdAt: card.createdAt ?? undefined,
                updatedAt: card.updatedAt ?? undefined,
                gapText: card.gapText ?? null,
              },
            })

            if (card.reviewLogs && card.reviewLogs.length > 0) {
              await tx.reviewLog.createMany({
                data: card.reviewLogs.map((log) => ({
                  isCorrect: log.isCorrect !== undefined ? log.isCorrect : true,
                  deckId: createdDeck.id,
                  cardId: createdCard.id,
                  createdAt: log.createdAt ?? undefined,
                })),
              })
            }
          }
        }
      }
    })

    revalidatePath("/")
    revalidatePath("/settings")
    return { success: true }
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { success: false, error: "Nicht autorisiert. Bitte melde dich an." }
    }
    console.error("Import failed:", error)
    return { success: false, error: "Beim Import ist ein Fehler aufgetreten. Bitte überprüfe die Datei." }
  }
}

export async function getSettings() {
  await requireAppAuth()
  const settings = await prisma.settings.findUnique({
    where: { id: "default" }
  })
  if (!settings) {
    return await prisma.settings.create({
      data: { id: "default" }
    })
  }
  return settings
}

export async function updateSettings(data: {
  minigamesEnabled?: boolean;
  minigameIntervalMin?: number;
  minigameIntervalMax?: number;
  speedMatchEnabled?: boolean;
  balloonPopEnabled?: boolean;
  reactionTesterEnabled?: boolean;
  wordDropEnabled?: boolean;
  notificationsEnabled?: boolean;
  speechLanguage?: string;
  selectedModel?: string;
}) {
  await requireAppAuth()
  const isAuth = await checkSettingsAuth()
  if (!isAuth) {
    throw new Error("Nicht autorisiert. Bitte melde dich mit dem Einstellungspasswort an.")
  }

  const updatedSettings = await prisma.settings.update({
    where: { id: "default" },
    data
  })
  revalidatePath("/settings")
  revalidatePath("/decks/[id]/study", "page")
  return updatedSettings
}

export async function getAvailableAiModelsAction() {
  await requireAppAuth()
  const { getStoredAiModels } = await import("@/lib/services/ai-models")
  return await getStoredAiModels()
}

export async function syncAiModelsAction(): Promise<{
  success: boolean;
  count: number;
  error?: string;
  apiStats?: import("@/actions/api-stats").ApiStatsResult[];
}> {
  await requireAppAuth()
  const isAuth = await checkSettingsAuth()
  if (!isAuth) {
    return { success: false, count: 0, error: "Nicht autorisiert. Bitte melde dich mit dem Einstellungspasswort an." }
  }

  const { fetchAndPersistGoogleModels } = await import("@/lib/services/ai-models")
  const result = await fetchAndPersistGoogleModels()
  revalidatePath("/settings")

  const { getApiStats } = await import("@/actions/api-stats")
  const apiStats = await getApiStats()

  return { ...result, apiStats }
}
