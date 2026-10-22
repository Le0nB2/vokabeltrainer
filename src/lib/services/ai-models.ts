import { GoogleGenAI } from "@google/genai";
import prisma from "@/lib/prisma";

export interface FilteredAiModel {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
}

/**
 * Returns the models configured to be used for LLM requests.
 * The user-selected model comes first, followed by safe fallbacks.
 */
export async function getModelHierarchy(): Promise<string[]> {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: "default" },
      select: { selectedModel: true },
    });
    const selected = settings?.selectedModel || "gemini-3.5-flash-lite";
    const fallbacks = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
    return Array.from(new Set([selected, ...fallbacks]));
  } catch (error) {
    console.error("Fehler beim Laden des ausgewählten KI-Modells:", error);
    return ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
  }
}

/**
 * Retrieves all stored models from the database.
 * If no models have been fetched yet, returns a default list containing gemini-3.5-flash-lite.
 */
export async function getStoredAiModels(): Promise<FilteredAiModel[]> {
  const models = await prisma.aiModel.findMany({
    orderBy: { displayName: "asc" },
  });

  if (models.length === 0) {
    return [
      {
        id: "gemini-3.5-flash-lite",
        name: "models/gemini-3.5-flash-lite",
        displayName: "Gemini 3.5 Flash Lite",
        description: "Standardmodell (noch nicht mit Google synchronisiert)",
      },
      {
        id: "gemini-3.1-flash-lite",
        name: "models/gemini-3.1-flash-lite",
        displayName: "Gemini 3.1 Flash Lite",
        description: "Fallback-Modell",
      },
    ];
  }

  return models.map((m) => ({
    id: m.id,
    name: m.name,
    displayName: m.displayName,
    description: m.description,
  }));
}

/**
 * Determines whether a model returned by Google is suitable for the Vokabeltrainer app.
 * Suitable models must be active general-purpose Gemini models that handle vision & JSON generation
 * (excluding legacy/deprecated 1.x/2.x models, audio/TTS, pure image generation, robotics, or experimental tools).
 */
export function isSuitableModel(id: string): boolean {
  if (!id.startsWith("gemini-")) return false;

  // Exclude legacy versions that Google has deprecated or discontinued
  if (id.startsWith("gemini-1.") || id.startsWith("gemini-2.")) return false;

  const unsuitableKeywords = [
    "tts",
    "audio",
    "transcribe",
    "image",
    "computer-use",
    "customtools",
    "robotics",
    "banana",
    "omni",
    "argon",
  ];

  return !unsuitableKeywords.some((keyword) => id.includes(keyword));
}

/**
 * Determines whether a model is accessible on the Google AI Studio Free Tier
 * or requires a paid pay-as-you-go billing account.
 * In Google's official naming hierarchy, all Pro flagship models require paid billing,
 * while Flash and Flash-Lite models have free tier quotas.
 */
export function getModelTier(id: string): "free" | "paid" {
  if (id.toLowerCase().includes("pro")) {
    return "paid";
  }
  return "free";
}

/**
 * Connects to Google GenAI API using configured keys,
 * retrieves all available models, filters for text/vision Gemini models,
 * and saves them into the SQLite database.
 */
export async function fetchAndPersistGoogleModels(customAiClient?: any): Promise<{
  success: boolean;
  count: number;
  error?: string;
}> {
  const validModels: FilteredAiModel[] = [];

  if (customAiClient) {
    const pager = await customAiClient.models.list();
    for await (const m of pager) {
      if (!m.supportedActions?.includes("generateContent")) continue;
      const id = (m.name || "").replace(/^models\//, "");
      if (!isSuitableModel(id)) continue;
      validModels.push({
        id,
        name: m.name || `models/${id}`,
        displayName: m.displayName || id,
        description: m.description || null,
      });
    }
  } else {
    const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY;
    if (!rawKeys) {
      return {
        success: false,
        count: 0,
        error: "Kein GEMINI_API_KEY in der Konfiguration hinterlegt.",
      };
    }

    const apiKeys = rawKeys
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (apiKeys.length === 0) {
      return {
        success: false,
        count: 0,
        error: "Keine gültigen API-Keys gefunden.",
      };
    }

    let lastError: unknown = null;

    for (const apiKey of apiKeys) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const pager = await ai.models.list();

        for await (const m of pager) {
          if (!m.supportedActions?.includes("generateContent")) continue;

          const id = (m.name || "").replace(/^models\//, "");
          if (!isSuitableModel(id)) continue;

          validModels.push({
            id,
            name: m.name || `models/${id}`,
            displayName: m.displayName || id,
            description: m.description || null,
          });
        }

        if (validModels.length > 0) {
          break; // Successfully fetched
        }
      } catch (err) {
        console.warn("Fehler beim Abrufen der Modelle mit API-Key:", err);
        lastError = err;
      }
    }

    if (validModels.length === 0) {
      const errorMsg =
        lastError instanceof Error ? lastError.message : "Keine Modelle gefunden.";
      return {
        success: false,
        count: 0,
        error: `Fehler beim Abruf von Google: ${errorMsg}`,
      };
    }
  }

  // Store in database
  const validIds = validModels.map((m) => m.id);

  await prisma.$transaction(async (tx) => {
    // Remove obsolete models
    await tx.aiModel.deleteMany({
      where: { id: { notIn: validIds } },
    });

    for (const model of validModels) {
      await tx.aiModel.upsert({
        where: { id: model.id },
        update: {
          name: model.name,
          displayName: model.displayName,
          description: model.description,
        },
        create: {
          id: model.id,
          name: model.name,
          displayName: model.displayName,
          description: model.description,
        },
      });
    }
  });

  return {
    success: true,
    count: validModels.length,
  };
}
