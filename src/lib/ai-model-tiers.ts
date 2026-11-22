/**
 * Shared Model Tier Classification (Google Gemini & AI Providers)
 *
 * Safe-by-Default Principle:
 * In Google AI Studio, Free Tier quota is strictly limited to the lightweight tier:
 * - "flash" (and "flash-lite")
 * - "hydrogen" (Gemini 4 free tier lightweight element)
 *
 * All frontier, reasoning, heavy element, or specialized models (e.g. Pro, Carbon, Neon, Argon, Deep Research)
 * are Paid-only (quota limit: 0 on free accounts or requiring an active billing account).
 *
 * To prevent billing surprises and quota limit errors (429 / limit: 0) on free keys,
 * unknown/new models fall back to "paid" unless proven otherwise via probe-test or known free identifier.
 */

export type ModelTier = "free" | "paid";

/**
 * Keywords that explicitly denote paid / pay-as-you-go frontier models.
 */
export const KNOWN_PAID_KEYWORDS = [
  "pro",
  "carbon",
  "argon",
  "neon",
  "deep-research",
  "ultra",
  "expert",
] as const;

/**
 * Keywords that explicitly denote free tier models in Google AI Studio.
 */
export const KNOWN_FREE_KEYWORDS = [
  "flash",
  "hydrogen",
] as const;

/**
 * Classifies a model based on static heuristics:
 * - "paid": explicitly contains paid keywords
 * - "free": explicitly contains free tier keywords (and no paid keywords)
 * - "unknown": name does not match known patterns, requiring probe-test or safe fallback
 */
export function getHeuristicModelTier(
  id: string,
  displayName?: string | null
): "free" | "paid" | "unknown" {
  const target = `${id} ${displayName || ""}`.toLowerCase();

  // 1. Explicit Paid keywords take precedence
  if (KNOWN_PAID_KEYWORDS.some((kw) => target.includes(kw))) {
    return "paid";
  }

  // 2. Explicit Free keywords
  if (KNOWN_FREE_KEYWORDS.some((kw) => target.includes(kw))) {
    return "free";
  }

  return "unknown";
}

/**
 * Returns whether a model is classified as "free" or "paid".
 * If static heuristics are unknown, safe fallback is "paid" (or provided fallbackTier).
 */
export function getModelTier(
  id: string,
  displayName?: string | null,
  fallbackTier: ModelTier = "paid"
): ModelTier {
  const heuristic = getHeuristicModelTier(id, displayName);
  if (heuristic === "unknown") {
    return fallbackTier;
  }
  return heuristic;
}

/**
 * Helper to determine if a model is Paid.
 */
export function isPaidModel(id: string, displayName?: string | null): boolean {
  return getModelTier(id, displayName) === "paid";
}

/**
 * Helper to determine if a model is Free.
 */
export function isFreeModel(id: string, displayName?: string | null): boolean {
  return getModelTier(id, displayName) === "free";
}
