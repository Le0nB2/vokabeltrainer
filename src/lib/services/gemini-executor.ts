import { GoogleGenAI } from "@google/genai";
import prisma from "@/lib/prisma";
import { getModelHierarchy } from "@/lib/services/ai-models";

export class QuotaExceededError extends Error {
  constructor(
    message: string = "Dein kostenloses Google API-Kontingent ist für heute aufgebraucht. Heute sind leider keine weiteren KI-Anfragen mehr möglich. Bitte versuche es morgen wieder."
  ) {
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

/**
 * Default backoff retry delays for overloaded models (in ms):
 * 1st retry (after attempt 1 fails): 4 seconds
 * 2nd retry (after attempt 2 fails): 7 seconds
 */
export const DEFAULT_RETRY_DELAYS_MS = [4000, 7000];

export function getRetryDelayMs(
  attempt: number,
  customDelayMs?: number,
  customDelaysMs?: number[]
): number {
  if (customDelayMs !== undefined) {
    return customDelayMs;
  }
  if (customDelaysMs && customDelaysMs[attempt] !== undefined) {
    return customDelaysMs[attempt];
  }
  return DEFAULT_RETRY_DELAYS_MS[attempt] ?? 7000;
}

export interface GeminiStatusEvent {
  type: "start" | "retry" | "fallback" | "key_switch";
  message: string;
  model?: string;
  attempt?: number;
  maxAttempts?: number;
  delaySeconds?: number;
  keyIndex?: number;
}

export interface CallGeminiOptions<T> {
  endpoint: string;
  apiKeys: string[];
  models?: string[];
  retryDelayMs?: number;
  retryDelaysMs?: number[];
  maxAttemptsPrimaryModel?: number;
  maxAttemptsFallbackModel?: number;
  execute: (ai: GoogleGenAI, model: string) => Promise<T>;
  onStatus?: (event: GeminiStatusEvent) => void | Promise<void>;
}

/**
 * Executes a Gemini request with model hierarchy and overload retry logic:
 * 1. Requests the selected model first (up to 3 attempts with staged backoff: 4s on 1st retry, 7s on 2nd retry).
 * 2. If still unsuccessful, falls back to the next model (e.g. gemini-flash-lite-latest)
 *    and attempts it exactly 1 time.
 * 3. Rotates across API keys if quota (429) is exhausted.
 */
export async function callGeminiWithRetry<T>({
  endpoint,
  apiKeys,
  models: customModels,
  retryDelayMs,
  retryDelaysMs,
  maxAttemptsPrimaryModel = 3,
  maxAttemptsFallbackModel = 1,
  execute,
  onStatus,
}: CallGeminiOptions<T>): Promise<T> {
  if (!apiKeys || apiKeys.length === 0) {
    throw new Error("No API keys provided for Gemini request");
  }

  const safeNotify = async (event: GeminiStatusEvent) => {
    if (!onStatus) return;
    try {
      await onStatus(event);
    } catch (notifyErr) {
      console.error("Fehler im onStatus-Callback:", notifyErr);
    }
  };

  const models = customModels && customModels.length > 0 ? customModels : await getModelHierarchy();
  let lastError: unknown = null;

  for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
    const apiKey = apiKeys[keyIndex];
    const ai = new GoogleGenAI({ apiKey });
    let keyQuotaExhausted = false;

    for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
      const modelToUse = models[modelIndex];
      // Das ausgewählte Modell (Index 0) wird 3x angefragt, das Fallback-Modell nur 1x
      const maxAttempts = modelIndex === 0 ? maxAttemptsPrimaryModel : maxAttemptsFallbackModel;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          await safeNotify({
            type: "start",
            message: `KI-Anfrage an Modell ${modelToUse} gestartet (Versuch ${attempt + 1}/${maxAttempts})...`,
            model: modelToUse,
            attempt: attempt + 1,
            maxAttempts,
            keyIndex: keyIndex + 1,
          });

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

          const isOverloaded = isOverloadedError(error);
          const isQuota = isQuotaError(error);
          const errorReason = isOverloaded ? "overloaded" : isQuota ? "quota" : "other";

          // Log failed attempt to DB
          await prisma.apiUsageLog.create({
            data: {
              apiKeyIndex: keyIndex + 1,
              isSuccess: false,
              endpoint,
              errorReason,
            },
          }).catch((err) => console.error("DB Log Error:", err));

          if (isQuota) {
            console.warn(
              `API-Key bei Index ${keyIndex} hat Kontingent erschöpft (Modell ${modelToUse}). Versuche nächsten Key falls verfügbar.`
            );
            keyQuotaExhausted = true;
            if (keyIndex < apiKeys.length - 1) {
              await safeNotify({
                type: "key_switch",
                message: `API-Key ${keyIndex + 1} hat Kontingent erschöpft. Wechsle zu Schlüssel ${keyIndex + 2}...`,
                keyIndex: keyIndex + 2,
              });
            }
            if (keyIndex === apiKeys.length - 1 && modelIndex === models.length - 1) {
              throw new QuotaExceededError();
            }
            break; // Stop retrying this model, break to switch API key
          }

          if (isOverloaded) {
            if (attempt < maxAttempts - 1) {
              const currentDelayMs = getRetryDelayMs(attempt, retryDelayMs, retryDelaysMs);
              const delaySec = Math.max(1, Math.round(currentDelayMs / 1000));
              console.warn(
                `Modell ${modelToUse} ist überlastet (Versuch ${attempt + 1}/${maxAttempts}, Key ${keyIndex + 1}). Warte ${delaySec}s vor erneutem Versuch...`
              );
              await safeNotify({
                type: "retry",
                message: `Modell ${modelToUse} ist überlastet. Neuer Versuch in ${delaySec} Sekunden (Versuch ${attempt + 1}/${maxAttempts})...`,
                model: modelToUse,
                attempt: attempt + 1,
                maxAttempts,
                delaySeconds: delaySec,
                keyIndex: keyIndex + 1,
              });
              await sleep(currentDelayMs);
              continue; // Retry with the SAME model
            } else {
              const nextModel = models[modelIndex + 1];
              console.warn(
                `Modell ${modelToUse} nach ${maxAttempts} Versuch(en) weiterhin überlastet. Wechsle zum Fallback-Modell falls verfügbar.`
              );
              if (nextModel) {
                await safeNotify({
                  type: "fallback",
                  message: `Modell ${modelToUse} nach ${maxAttempts} Versuchen weiterhin überlastet. Wechsle zum Fallback-Modell ${nextModel}...`,
                  model: nextModel,
                });
              }
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
