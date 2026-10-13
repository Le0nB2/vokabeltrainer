"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function importData(jsonData: string) {
  try {
    const parsedData = JSON.parse(jsonData)

    let data;
    let settingsData = null;

    if (Array.isArray(parsedData)) {
      // Old format
      data = parsedData;
    } else if (parsedData && parsedData.decks && Array.isArray(parsedData.decks)) {
      // New format (version 2)
      data = parsedData.decks;
      settingsData = parsedData.settings;
    } else {
      return { success: false, error: "Ungültiges Dateiformat. Erwartet wird ein Array von Decks oder ein gültiges Backup-Objekt." }
    }

    // Wrap in a transaction to ensure all or nothing
    await prisma.$transaction(async (tx) => {
        // Restore Settings if available
        if (settingsData) {
           const { id, ...settingsWithoutId } = settingsData;
           await tx.settings.upsert({
               where: { id: "default" },
               update: settingsWithoutId,
               create: {
                   id: "default",
                   ...settingsWithoutId
               }
           });
        }

        for (const deck of data) {
            const createdDeck = await tx.deck.create({
                data: {
                    title: deck.title,
                    description: deck.description,
                    createdAt: deck.createdAt ? new Date(deck.createdAt) : undefined,
                    updatedAt: deck.updatedAt ? new Date(deck.updatedAt) : undefined,
                    lastResultCorrect: deck.lastResultCorrect,
                    lastResultIncorrect: deck.lastResultIncorrect,
                }
            })

            if (deck.cards && Array.isArray(deck.cards)) {
                for (const card of deck.cards) {
                    const createdCard = await tx.card.create({
                        data: {
                            deckId: createdDeck.id,
                            front: card.front,
                            back: card.back,
                            notes: card.notes,
                            mnemonic: card.mnemonic,
                            contextSentence: card.contextSentence,
                            easeFactor: card.easeFactor,
                            lapses: card.lapses,
                            box: card.box,
                            consecutiveCorrect: card.consecutiveCorrect,
                            dueDate: card.dueDate ? new Date(card.dueDate) : undefined,
                            lastReviewed: card.lastReviewed ? new Date(card.lastReviewed) : undefined,
                            createdAt: card.createdAt ? new Date(card.createdAt) : undefined,
                            updatedAt: card.updatedAt ? new Date(card.updatedAt) : undefined,
                            gapText: card.gapText,
                        }
                    })

                    if (card.reviewLogs && Array.isArray(card.reviewLogs)) {
                        await tx.reviewLog.createMany({
                            data: card.reviewLogs.map((log: { createdAt?: string | Date, isCorrect?: boolean }) => ({
                                isCorrect: log.isCorrect !== undefined ? log.isCorrect : true,
                                deckId: createdDeck.id,
                                cardId: createdCard.id,
                                createdAt: log.createdAt ? new Date(log.createdAt) : undefined,
                            }))
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
    console.error("Import failed:", error)
    return { success: false, error: "Beim Import ist ein Fehler aufgetreten. Bitte überprüfe die Datei." }
  }
}

export async function getSettings() {
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
  const updatedSettings = await prisma.settings.update({
    where: { id: "default" },
    data
  })
  revalidatePath("/settings")
  revalidatePath("/decks/[id]/study", "page")
  return updatedSettings
}
