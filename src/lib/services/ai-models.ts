import { GoogleGenAI } from "@google/genai";
import prisma from "@/lib/prisma";

export interface FilteredAiModel {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
}

export const DEFAULT_AI_MODEL = "gemini-3.6-flash";
export const FALLBACK_AI_MODEL = "gemini-flash-lite-latest";

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
    const selected = settings?.selectedModel || DEFAULT_AI_MODEL;
    const fallbacks = [FALLBACK_AI_MODEL];
    return Array.from(new Set([selected, ...fallbacks]));
  } catch (error) {
    console.error("Fehler beim Laden des ausgewählten KI-Modells:", error);
    return [DEFAULT_AI_MODEL, FALLBACK_AI_MODEL];
  }
}

/**
 * Retrieves all stored models from the database.
 * If no models have been fetched yet, returns a default list containing the standard and fallback models.
 */
export async function getStoredAiModels(): Promise<FilteredAiModel[]> {
  try {
    const models = await prisma.aiModel.findMany({
      orderBy: { displayName: "asc" },
    });

    if (models.length === 0) {
      return [
        {
          id: DEFAULT_AI_MODEL,
          name: `models/${DEFAULT_AI_MODEL}`,
          displayName: "Gemini 3.6 Flash",
          description: "Standardmodell",
        },
        {
          id: FALLBACK_AI_MODEL,
          name: `models/${FALLBACK_AI_MODEL}`,
          displayName: "Gemini Flash-Lite Latest",
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
  } catch (error) {
    console.error("Fehler beim Laden der gespeicherten KI-Modelle:", error);
    return [
      {
        id: DEFAULT_AI_MODEL,
        name: `models/${DEFAULT_AI_MODEL}`,
        displayName: "Gemini 3.6 Flash",
        description: "Standardmodell",
      },
      {
        id: FALLBACK_AI_MODEL,
        name: `models/${FALLBACK_AI_MODEL}`,
        displayName: "Gemini Flash-Lite Latest",
        description: "Fallback-Modell",
      },
    ];
  }
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
    try {
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

      await prisma.apiUsageLog.create({
        data: {
          apiKeyIndex: 1,
          isSuccess: true,
          endpoint: "models",
        },
      }).catch((err) => console.error("DB Log Error:", err));
    } catch (err) {
      await prisma.apiUsageLog.create({
        data: {
          apiKeyIndex: 1,
          isSuccess: false,
          endpoint: "models",
        },
      }).catch((logErr) => console.error("DB Log Error:", logErr));
      return {
        success: false,
        count: 0,
        error: `Fehler beim Abruf von Google: ${err instanceof Error ? err.message : String(err)}`,
      };
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

    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i];
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

        // Successfully fetched from Google API
        await prisma.apiUsageLog.create({
          data: {
            apiKeyIndex: i + 1,
            isSuccess: true,
            endpoint: "models",
          },
        }).catch((err) => console.error("DB Log Error:", err));

        if (validModels.length > 0) {
          break; // Successfully fetched
        }
      } catch (err) {
        // Log error attempt to ApiUsageLog
        await prisma.apiUsageLog.create({
          data: {
            apiKeyIndex: i + 1,
            isSuccess: false,
            endpoint: "models",
          },
        }).catch((logErr) => console.error("DB Log Error:", logErr));

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
