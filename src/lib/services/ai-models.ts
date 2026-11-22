import { GoogleGenAI } from "@google/genai";
import prisma from "@/lib/prisma";
import {
  getModelTier,
  getHeuristicModelTier,
  isPaidModel,
  isFreeModel,
  KNOWN_PAID_KEYWORDS,
  KNOWN_FREE_KEYWORDS,
  ModelTier,
} from "@/lib/ai-model-tiers";

export interface FilteredAiModel {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  tier: "free" | "paid";
}

export const DEFAULT_AI_MODEL = "gemini-4-hydrogen";
export const FALLBACK_AI_MODEL = "gemini-flash-lite-latest";

export {
  getModelTier,
  getHeuristicModelTier,
  isPaidModel,
  isFreeModel,
  KNOWN_PAID_KEYWORDS,
  KNOWN_FREE_KEYWORDS,
};
export const KNOWN_PAID_MODELS = KNOWN_PAID_KEYWORDS;

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
      where: { provider: "gemini" },
      orderBy: { displayName: "asc" },
    });

    if (models.length === 0) {
      return [
        {
          id: DEFAULT_AI_MODEL,
          name: `models/${DEFAULT_AI_MODEL}`,
          displayName: "Gemini 4 Hydrogen",
          description: "Standardmodell",
          tier: "free",
        },
        {
          id: FALLBACK_AI_MODEL,
          name: `models/${FALLBACK_AI_MODEL}`,
          displayName: "Gemini Flash-Lite Latest",
          description: "Fallback-Modell",
          tier: "free",
        },
      ];
    }

    return models.map((m) => ({
      id: m.id,
      name: m.name,
      displayName: m.displayName,
      description: m.description,
      tier: (m.tier === "free" || m.tier === "paid")
        ? (m.tier as "free" | "paid")
        : getModelTier(m.id, m.displayName),
    }));
  } catch (error) {
    console.error("Fehler beim Laden der gespeicherten KI-Modelle:", error);
    return [
      {
        id: DEFAULT_AI_MODEL,
        name: `models/${DEFAULT_AI_MODEL}`,
        displayName: "Gemini 4 Hydrogen",
        description: "Standardmodell",
        tier: "free",
      },
      {
        id: FALLBACK_AI_MODEL,
        name: `models/${FALLBACK_AI_MODEL}`,
        displayName: "Gemini Flash-Lite Latest",
        description: "Fallback-Modell",
        tier: "free",
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
 * Probes a model with a minimal 1-token prompt to verify if it works on the Free Tier
 * or requires a paid pay-as-you-go billing account.
 */
export async function probeModelTier(
  aiClient: any,
  modelId: string
): Promise<"free" | "paid"> {
  try {
    if (aiClient?.models?.generateContent) {
      await aiClient.models.generateContent({
        model: modelId,
        contents: "ping",
        config: { maxOutputTokens: 1 },
      });
      return "free";
    }
    return "paid";
  } catch (err: any) {
    const msg = (err?.message || "").toLowerCase();
    console.info(`[ModelProbe] Modell ${modelId} nicht im Free Tier verfügbar (${msg.slice(0, 100)}) -> paid`);
    return "paid";
  }
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
  let activeAiClient: any = customAiClient;

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
          tier: "free",
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
    let apiKeys: string[] = [];

    // 1. Zuerst gespeicherte Keys aus der Datenbank prüfen (inkl. kommagetrennter Mehrfach-Keys)
    try {
      const cred = await prisma.userAiCredential.findFirst({
        where: { provider: "gemini_key" },
      });
      if (cred?.apiKey) {
        const { decryptSecret } = await import("@/lib/security/crypto");
        const decrypted = decryptSecret(cred.apiKey);
        if (decrypted) {
          apiKeys = decrypted.split(/[,\n;]+/).map((k) => k.trim()).filter(Boolean);
        }
      }
    } catch {
      // Ignorieren falls DB noch nicht bereit
    }

    // 2. Fallback auf Umgebungsvariablen
    if (apiKeys.length === 0) {
      const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY;
      if (rawKeys) {
        apiKeys = rawKeys
          .split(/[,\n;]+/)
          .map((k) => k.trim())
          .filter(Boolean);
      }
    }

    if (apiKeys.length === 0) {
      return {
        success: false,
        count: 0,
        error: "Kein GEMINI_API_KEY in der Konfiguration oder Datenbank hinterlegt.",
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
            tier: "free",
          });
        }

        // Successfully fetched from Google API
        activeAiClient = ai;
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

  // Retrieve existing models from database to reuse previously probed/stored tiers
  const existingDbModels = await prisma.aiModel.findMany({
    where: { provider: "gemini" },
    select: { id: true, tier: true },
  }).catch(() => []);
  const existingTierMap = new Map(existingDbModels.map((m) => [m.id, m.tier]));

  // Resolve tier for each model
  await Promise.all(
    validModels.map(async (model) => {
      const existingTier = existingTierMap.get(model.id);
      if (existingTier === "free" || existingTier === "paid") {
        model.tier = existingTier;
        return;
      }

      const heuristic = getHeuristicModelTier(model.id, model.displayName);
      if (heuristic === "paid" || heuristic === "free") {
        model.tier = heuristic;
        return;
      }

      // Model is unclassified/new: run lightweight 1-token probe test
      if (activeAiClient) {
        model.tier = await probeModelTier(activeAiClient, model.id);
      } else {
        model.tier = getModelTier(model.id, model.displayName);
      }
    })
  );

  // Store in database
  const validIds = validModels.map((m) => m.id);

  await prisma.$transaction(async (tx) => {
    // Remove obsolete models for Gemini only
    await tx.aiModel.deleteMany({
      where: {
        provider: "gemini",
        id: { notIn: validIds },
      },
    });

    for (const model of validModels) {
      await tx.aiModel.upsert({
        where: { id: model.id },
        update: {
          name: model.name,
          displayName: model.displayName,
          description: model.description,
          provider: "gemini",
          tier: model.tier,
        },
        create: {
          id: model.id,
          name: model.name,
          displayName: model.displayName,
          description: model.description,
          provider: "gemini",
          tier: model.tier,
        },
      });
    }
  });

  return {
    success: true,
    count: validModels.length,
  };
}
