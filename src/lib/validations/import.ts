import { z } from "zod"

export const MAX_IMPORT_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB
export const MAX_DECKS_PER_IMPORT = 100
export const MAX_CARDS_PER_DECK = 2000
export const MAX_REVIEW_LOGS_PER_CARD = 1000

export const ReviewLogImportSchema = z.object({
  id: z.string().max(100).optional(),
  cardId: z.string().max(100).optional(),
  deckId: z.string().max(100).optional(),
  isCorrect: z.boolean().default(true),
  createdAt: z.coerce.date().optional().nullable(),
})
export type ValidatedReviewLog = z.infer<typeof ReviewLogImportSchema>

export const CardImportSchema = z.object({
  id: z.string().max(100).optional(),
  deckId: z.string().max(100).optional(),
  front: z
    .string()
    .trim()
    .min(1, "Vorderseite darf nicht leer sein")
    .max(2000, "Vorderseite darf maximal 2000 Zeichen lang sein"),
  back: z
    .string()
    .trim()
    .min(1, "Rückseite darf nicht leer sein")
    .max(2000, "Rückseite darf maximal 2000 Zeichen lang sein"),
  notes: z.string().max(2000, "Notizen dürfen maximal 2000 Zeichen lang sein").optional().nullable(),
  mnemonic: z.string().max(1000, "Eselsbrücke darf maximal 1000 Zeichen lang sein").optional().nullable(),
  contextSentence: z.string().max(2000, "Beispielsatz darf maximal 2000 Zeichen lang sein").optional().nullable(),
  easeFactor: z
    .number()
    .min(1.0, "Ease-Factor muss mindestens 1.0 sein")
    .max(5.0, "Ease-Factor darf maximal 5.0 sein")
    .optional()
    .default(2.5),
  lapses: z
    .number()
    .int()
    .min(0, "Fehlversuche müssen mindestens 0 sein")
    .max(100000)
    .optional()
    .default(0),
  box: z
    .number()
    .int()
    .min(0, "Box-Nummer muss mindestens 0 sein")
    .max(50, "Box-Nummer darf maximal 50 sein")
    .optional()
    .default(1),
  consecutiveCorrect: z.number().int().min(0).max(100000).optional().default(0),
  dueDate: z.coerce.date().optional().nullable(),
  lastReviewed: z.coerce.date().optional().nullable(),
  createdAt: z.coerce.date().optional().nullable(),
  updatedAt: z.coerce.date().optional().nullable(),
  gapText: z.string().max(2000, "Lückentext darf maximal 2000 Zeichen lang sein").optional().nullable(),
  reviewLogs: z
    .array(ReviewLogImportSchema)
    .max(MAX_REVIEW_LOGS_PER_CARD, `Maximal ${MAX_REVIEW_LOGS_PER_CARD} Review-Logs pro Karte erlaubt`)
    .optional()
    .nullable()
    .transform((val) => val ?? []),
})
export type ValidatedCard = z.infer<typeof CardImportSchema>

export const DeckImportSchema = z.object({
  id: z.string().max(100).optional(),
  title: z
    .string()
    .trim()
    .min(1, "Deck-Titel darf nicht leer sein")
    .max(200, "Deck-Titel darf maximal 200 Zeichen lang sein"),
  description: z.string().max(2000, "Beschreibung darf maximal 2000 Zeichen lang sein").optional().nullable(),
  createdAt: z.coerce.date().optional().nullable(),
  updatedAt: z.coerce.date().optional().nullable(),
  lastResultCorrect: z.number().int().min(0).optional().nullable(),
  lastResultIncorrect: z.number().int().min(0).optional().nullable(),
  cards: z
    .array(CardImportSchema)
    .max(MAX_CARDS_PER_DECK, `Maximal ${MAX_CARDS_PER_DECK} Karten pro Deck erlaubt`)
    .optional()
    .nullable()
    .transform((val) => val ?? []),
  reviewLogs: z.array(ReviewLogImportSchema).max(50000).optional().nullable(),
})
export type ValidatedDeck = z.infer<typeof DeckImportSchema>

export const SettingsImportSchema = z.object({
  id: z.string().max(50).optional(),
  minigamesEnabled: z.boolean().optional(),
  minigameIntervalMin: z.number().int().min(1, "Intervall min. 1").max(1000, "Intervall max. 1000").optional(),
  minigameIntervalMax: z.number().int().min(1, "Intervall min. 1").max(1000, "Intervall max. 1000").optional(),
  speedMatchEnabled: z.boolean().optional(),
  balloonPopEnabled: z.boolean().optional(),
  reactionTesterEnabled: z.boolean().optional(),
  wordDropEnabled: z.boolean().optional(),
  worksheetCount: z.number().int().min(0).max(100000).optional(),
  notificationsEnabled: z.boolean().optional(),
  speechLanguage: z.string().max(20, "Sprachcode darf maximal 20 Zeichen lang sein").optional(),
  selectedModel: z.string().max(100, "Modellname darf maximal 100 Zeichen lang sein").optional(),
})
export type ValidatedSettings = z.infer<typeof SettingsImportSchema>

export const BackupObjectSchema = z.object({
  version: z.number().int().optional(),
  settings: SettingsImportSchema.optional().nullable(),
  decks: z
    .array(DeckImportSchema)
    .max(MAX_DECKS_PER_IMPORT, `Maximal ${MAX_DECKS_PER_IMPORT} Decks pro Import erlaubt`),
})

export const BackupArraySchema = z
  .array(DeckImportSchema)
  .max(MAX_DECKS_PER_IMPORT, `Maximal ${MAX_DECKS_PER_IMPORT} Decks pro Import erlaubt`)

export function formatValidationErrors(issues: z.ZodIssue[]): string {
  const messages = issues.slice(0, 3).map((issue) => {
    const pathStr = issue.path.length > 0 ? `${issue.path.join(".")}: ` : ""
    return `${pathStr}${issue.message}`
  })
  const suffix = issues.length > 3 ? ` (und ${issues.length - 3} weitere Fehler)` : ""
  return `Ungültige Daten in der Importdatei: ${messages.join("; ")}${suffix}`
}

export type ValidatedBackup = {
  decks: ValidatedDeck[]
  settings?: ValidatedSettings | null
}

export function validateBackupData(
  parsedData: unknown
): { success: true; data: ValidatedBackup } | { success: false; error: string } {
  if (Array.isArray(parsedData)) {
    const result = BackupArraySchema.safeParse(parsedData)
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) }
    }
    return {
      success: true,
      data: {
        decks: result.data,
        settings: null,
      },
    }
  }

  if (parsedData && typeof parsedData === "object" && "decks" in parsedData) {
    const result = BackupObjectSchema.safeParse(parsedData)
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) }
    }
    return {
      success: true,
      data: {
        decks: result.data.decks,
        settings: result.data.settings ?? null,
      },
    }
  }

  return {
    success: false,
    error: "Ungültiges Dateiformat. Erwartet wird ein Array von Decks oder ein Backup-Objekt mit 'decks'.",
  }
}
