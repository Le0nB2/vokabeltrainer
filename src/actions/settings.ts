"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAppAuth, UnauthorizedError } from "@/lib/auth-guard"
import { MAX_IMPORT_SIZE_BYTES, validateBackupData } from "@/lib/validations/import"
import { checkSettingsAuthenticated } from "@/actions/auth"

const checkSettingsAuth = checkSettingsAuthenticated

export async function importData(jsonData: string) {
  try {
    await requireAppAuth()
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

    // Wrap in a transaction to ensure all or nothing
    await prisma.$transaction(async (tx) => {
      // Restore Settings if available
      if (settings) {
        const { id, ...settingsWithoutId } = settings
        await tx.settings.upsert({
          where: { id: "default" },
          update: settingsWithoutId,
          create: {
            id: "default",
            ...settingsWithoutId,
          },
        })
      }

      for (const deck of decks) {
        const createdDeck = await tx.deck.create({
          data: {
            title: deck.title,
            description: deck.description ?? null,
            createdAt: deck.createdAt ?? undefined,
            updatedAt: deck.updatedAt ?? undefined,
            lastResultCorrect: deck.lastResultCorrect ?? null,
            lastResultIncorrect: deck.lastResultIncorrect ?? null,
          },
        })

        if (deck.cards && deck.cards.length > 0) {
          for (const card of deck.cards) {
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
                box: card.box,
                consecutiveCorrect: card.consecutiveCorrect,
                dueDate: card.dueDate ?? undefined,
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
