"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { verifySettingsSessionToken, SETTINGS_COOKIE_NAME } from "@/lib/auth-utils"
import { requireAppAuth, UnauthorizedError } from "@/lib/auth-guard"
import { MAX_IMPORT_SIZE_BYTES, validateBackupData } from "@/lib/validations/import"

async function checkSettingsAuth(): Promise<boolean> {
  const envPassword = process.env.SETTINGS_PASSWORD
  if (!envPassword) return true
  const cookieStore = await cookies()
  return verifySettingsSessionToken(cookieStore.get(SETTINGS_COOKIE_NAME)?.value, envPassword)
}

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
