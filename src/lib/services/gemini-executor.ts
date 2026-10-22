import { GoogleGenAI } from "@google/genai";
import prisma from "@/lib/prisma";
import { getModelHierarchy } from "@/lib/services/ai-models";

export class QuotaExceededError extends Error {
  constructor(message: string = "Dein kostenloses Google API-Kontingente ist aufgebraucht. Versuche es in ein paar Stunden noch einmal") {
    super(message);
    this.name = "QuotaExceededError";
  }
}

/**
 * Checks if an error represents a temporary overload / high demand (HTTP 503 or similar).
 */
export function isOverloadedError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number })?.status;

  return (
    status === 503 ||
    message.includes("503") ||
    message.toLowerCase().includes("service unavailable") ||
    message.toLowerCase().includes("overloaded") ||
    message.toLowerCase().includes("high demand") ||
    message.includes("UNAVAILABLE")
  );
}

/**
 * Checks if an error represents a quota exhaustion (HTTP 429 / RESOURCE_EXHAUSTED).
 */
export function isQuotaError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number })?.status;

  return (
    status === 429 ||
    message.includes("429") ||
    message.toLowerCase().includes("quota exceeded") ||
    message.includes("RESOURCE_EXHAUSTED")
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface CallGeminiOptions<T> {
  endpoint: string;
  apiKeys: string[];
  models?: string[];
  retryDelayMs?: number;
  maxAttemptsPerModel?: number;
  execute: (ai: GoogleGenAI, model: string) => Promise<T>;
}

/**
 * Executes a Gemini request with model hierarchy and overload retry logic:
 * 1. Requests the selected model first.
 * 2. If overloaded (e.g. 503), retries up to 2 additional times with 3s delay (3 attempts total).
 * 3. If still unsuccessful, falls back to the next model (e.g. gemini-flash-lite-latest)
 *    and also attempts it up to 3 times (with 3s delay between attempts).
 * 4. Rotates across API keys if quota (429) is exhausted.
 */
export async function callGeminiWithRetry<T>({
  endpoint,
  apiKeys,
  models: customModels,
  retryDelayMs = 3000,
  maxAttemptsPerModel = 3,
  execute,
}: CallGeminiOptions<T>): Promise<T> {
  if (!apiKeys || apiKeys.length === 0) {
    throw new Error("No API keys provided for Gemini request");
  }

  const models = customModels && customModels.length > 0 ? customModels : await getModelHierarchy();
  let lastError: unknown = null;

  for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
    const apiKey = apiKeys[keyIndex];
    const ai = new GoogleGenAI({ apiKey });
    let keyQuotaExhausted = false;

    for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
      const modelToUse = models[modelIndex];

      for (let attempt = 0; attempt < maxAttemptsPerModel; attempt++) {
        try {
          const result = await execute(ai, modelToUse);

          // Log success to DB
          await prisma.apiUsageLog.create({
            data: {
              apiKeyIndex: keyIndex + 1,
              isSuccess: true,
              endpoint,
            },
          }).catch((err) => console.error("DB Log Error:", err));

          return result;
        } catch (error: unknown) {
          lastError = error;

          // Log failed attempt to DB
          await prisma.apiUsageLog.create({
            data: {
              apiKeyIndex: keyIndex + 1,
              isSuccess: false,
              endpoint,
            },
          }).catch((err) => console.error("DB Log Error:", err));

          if (isQuotaError(error)) {
            console.warn(
              `API-Key bei Index ${keyIndex} hat Kontingent erschöpft (Modell ${modelToUse}). Versuche nächsten Key falls verfügbar.`
            );
            keyQuotaExhausted = true;
            if (keyIndex === apiKeys.length - 1 && modelIndex === models.length - 1) {
              throw new QuotaExceededError();
            }
            break; // Stop retrying this model, break to switch API key
          }

          if (isOverloadedError(error)) {
            if (attempt < maxAttemptsPerModel - 1) {
              console.warn(
                `Modell ${modelToUse} ist überlastet (Versuch ${attempt + 1}/${maxAttemptsPerModel}, Key ${keyIndex + 1}). Warte ${retryDelayMs / 1000}s vor erneutem Versuch...`
              );
              await sleep(retryDelayMs);
              continue; // Retry with the SAME model
            } else {
              console.warn(
                `Modell ${modelToUse} nach ${maxAttemptsPerModel} Versuchen weiterhin überlastet. Wechsle zum Fallback-Modell falls verfügbar.`
              );
              break; // Proceed to next model in hierarchy
            }
          }

          // Non-quota, non-overload error (e.g. 400 Bad Request, safety violation, parse error)
          console.error(`Unerwarteter Fehler mit Key-Index ${keyIndex} und Modell ${modelToUse}:`, error);
          if (modelIndex === models.length - 1 && keyIndex === apiKeys.length - 1) {
            throw error;
          }
          break; // Try next model if available
        }
      }

      if (keyQuotaExhausted) {
        break; // Break inner model loop, try next API key in outer loop
      }
    }
  }

  throw lastError;
}
