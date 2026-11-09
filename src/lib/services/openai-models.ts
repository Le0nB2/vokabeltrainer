import prisma from "@/lib/prisma"

export interface FilteredOpenAiModel {
  id: string
  name: string
  displayName: string
  description: string | null
  tier: "standard" | "flagship" | "reasoning"
}

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
export const FALLBACK_OPENAI_MODEL = "gpt-4o-mini"

export const STATIC_OPENAI_MODELS: FilteredOpenAiModel[] = [
  {
    id: "gpt-4o-mini",
    name: "gpt-4o-mini",
    displayName: "GPT-4o Mini",
    description: "Standard: Extrem schnell, kostengünstig und ideal für Vokabeln & OCR",
    tier: "standard",
  },
  {
    id: "chatgpt-4o-latest",
    name: "chatgpt-4o-latest",
    displayName: "ChatGPT-4o Latest (Dauer-Aktuell)",
    description: "Zukunftssicher: Zeigt serverseitig immer automatisch auf die neueste Version von GPT-4o",
    tier: "flagship",
  },
  {
    id: "gpt-4o",
    name: "gpt-4o",
    displayName: "GPT-4o",
    description: "Leistungsstarkes Flagship-Modell für anspruchsvolle Aufgaben",
    tier: "flagship",
  },
  {
    id: "o3-mini",
    name: "o3-mini",
    displayName: "o3-mini",
    description: "Reasoning-Modell für tiefgründige Logik und Schritt-für-Schritt-Denken",
    tier: "reasoning",
  },
]

export function getOpenAiModelTier(id: string): "standard" | "flagship" | "reasoning" {
  const lower = id.toLowerCase()
  if (lower.startsWith("o1") || lower.startsWith("o3")) {
    return "reasoning"
  }
  if (lower.includes("mini") || lower.includes("nano")) {
    return "standard"
  }
  return "flagship"
}

export function formatOpenAiDisplayName(id: string): string {
  if (id === "gpt-4o-mini") return "GPT-4o Mini"
  if (id === "chatgpt-4o-latest") return "ChatGPT-4o Latest (Dauer-Aktuell)"
  if (id === "gpt-4o") return "GPT-4o"
  if (id === "o3-mini") return "o3-mini"
  if (id === "o1-mini") return "o1-mini"
  if (id === "o1") return "o1"
  return id
}

export function isOpenAiSuitableModel(id: string): boolean {
  const lower = id.toLowerCase()

  // Must be chat/vision capable GPT or O-series
  const isFamily =
    lower.startsWith("gpt-4") ||
    lower.startsWith("chatgpt-4") ||
    lower.startsWith("gpt-5") ||
    lower.startsWith("o1") ||
    lower.startsWith("o3")

  if (!isFamily) return false

  // Exclude dated snapshots to prevent dropdown clutter (e.g. gpt-4o-2024-08-06)
  if (/\d{4}-\d{2}-\d{2}/.test(lower)) return false

  // Exclude non-chat / specialized modalities
  const excludedKeywords = [
    "embedding",
    "whisper",
    "dall-e",
    "tts",
    "realtime",
    "audio",
    "transcribe",
    "moderation",
    "instruct",
    "babbage",
    "davinci",
  ]

  if (excludedKeywords.some((kw) => lower.includes(kw))) {
    return false
  }

  return true
}

export async function getStoredOpenAiModels(): Promise<FilteredOpenAiModel[]> {
  try {
    const models = await prisma.aiModel.findMany({
      where: { provider: "openai" },
      orderBy: { displayName: "asc" },
    })

    if (models.length === 0) {
      return STATIC_OPENAI_MODELS
    }

    return models.map((m) => ({
      id: m.id,
      name: m.name,
      displayName: m.displayName,
      description: m.description,
      tier: getOpenAiModelTier(m.id),
    }))
  } catch (err) {
    console.error("Fehler beim Laden der gespeicherten OpenAI-Modelle:", err)
    return STATIC_OPENAI_MODELS
  }
}

export async function fetchAndPersistOpenAiModels(apiKey: string): Promise<{
  success: boolean
  count: number
  error?: string
}> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!res.ok) {
      const err = await res.text()
      return { success: false, count: 0, error: `OpenAI API Fehler (${res.status}): ${err}` }
    }

    const data = await res.json()
    const list: Array<{ id: string }> = data?.data || []

    const validModels: FilteredOpenAiModel[] = []

    // Ensure our anchor models are always present
    for (const anchor of STATIC_OPENAI_MODELS) {
      validModels.push(anchor)
    }

    for (const item of list) {
      const id = item.id
      if (isOpenAiSuitableModel(id) && !validModels.some((m) => m.id === id)) {
        validModels.push({
          id,
          name: id,
          displayName: formatOpenAiDisplayName(id),
          description: "Aus OpenAI API synchronisiert",
          tier: getOpenAiModelTier(id),
        })
      }
    }

    // Persist in DB
    await prisma.$transaction(async (tx) => {
      await tx.aiModel.deleteMany({
        where: { provider: "openai" },
      })

      for (const m of validModels) {
        await tx.aiModel.create({
          data: {
            id: m.id,
            name: m.name,
            displayName: m.displayName,
            description: m.description,
            provider: "openai",
          },
        })
      }
    })

    return { success: true, count: validModels.length }
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || "Fehler beim Abrufen der OpenAI-Modelle." }
  }
}
