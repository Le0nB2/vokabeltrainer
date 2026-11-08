import prisma from "@/lib/prisma"
import { decryptSecret } from "@/lib/security/crypto"
import { IAiProvider, AiGenerateOptions } from "./ai-provider.interface"
import { GeminiProvider } from "./providers/gemini-provider"
import { OpenRouterProvider } from "./providers/openrouter-provider"

export interface ResolvedAiConfig {
  providerId: "gemini" | "openrouter"
  provider: IAiProvider
  source: "user_credential" | "global_credential" | "env_fallback"
}

/**
 * Resolves the active AI provider based on user settings, DB credentials, and environment fallback.
 */
export async function getActiveAiProvider(userId?: string): Promise<ResolvedAiConfig> {
  // 1. Fetch active settings
  let activeProviderPreference: string = "gemini"
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: "default" },
    })
    if (settings?.activeAiProvider) {
      activeProviderPreference = settings.activeAiProvider
    }
  } catch {
    // If settings table not available yet, default to gemini
  }

  // 2. If OpenRouter is chosen, look for OpenRouter credentials
  if (activeProviderPreference === "openrouter") {
    let orKey: string | undefined

    if (userId) {
      const userCred = await prisma.userAiCredential.findFirst({
        where: {
          userId,
          provider: { in: ["openrouter_oauth", "openrouter_key"] },
        },
      })
      if (userCred?.apiKey || userCred?.accessToken) {
        orKey = decryptSecret((userCred.apiKey || userCred.accessToken)!)
      }
    }

    if (!orKey) {
      const globalCred = await prisma.userAiCredential.findFirst({
        where: {
          userId: null,
          provider: { in: ["openrouter_oauth", "openrouter_key"] },
        },
      })
      if (globalCred?.apiKey || globalCred?.accessToken) {
        orKey = decryptSecret((globalCred.apiKey || globalCred.accessToken)!)
      }
    }

    if (!orKey && process.env.OPENROUTER_API_KEY) {
      orKey = process.env.OPENROUTER_API_KEY.trim()
    }

    if (orKey) {
      return {
        providerId: "openrouter",
        provider: new OpenRouterProvider(orKey),
        source: userId ? "user_credential" : "global_credential",
      }
    }
  }

  // 3. Otherwise (or as fallback), look for Gemini credentials
  const geminiKeys: string[] = []

  if (userId) {
    const userCred = await prisma.userAiCredential.findFirst({
      where: {
        userId,
        provider: "gemini_key",
      },
    })
    if (userCred?.apiKey) {
      const decrypted = decryptSecret(userCred.apiKey)
      if (decrypted) geminiKeys.push(decrypted)
    }
  }

  if (geminiKeys.length === 0) {
    const globalCred = await prisma.userAiCredential.findFirst({
      where: {
        userId: null,
        provider: "gemini_key",
      },
    })
    if (globalCred?.apiKey) {
      const decrypted = decryptSecret(globalCred.apiKey)
      if (decrypted) geminiKeys.push(decrypted)
    }
  }

  if (geminiKeys.length === 0) {
    const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || ""
    const envKeys = rawKeys
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0)
    geminiKeys.push(...envKeys)
  }

  if (geminiKeys.length > 0) {
    return {
      providerId: "gemini",
      provider: new GeminiProvider(geminiKeys),
      source: userId ? "user_credential" : "env_fallback",
    }
  }

  // 4. If Gemini was not found but OpenRouter is available in ENV:
  if (process.env.OPENROUTER_API_KEY) {
    return {
      providerId: "openrouter",
      provider: new OpenRouterProvider(process.env.OPENROUTER_API_KEY.trim()),
      source: "env_fallback",
    }
  }

  throw new Error(
    "Kein aktiver KI-Dienst konfiguriert. Bitte hinterlege einen Google AI Studio Key oder verbinde OpenRouter in den Einstellungen."
  )
}

/**
 * Convenient helper to execute an AI request via the resolved provider.
 */
export async function executeAiRequest<T>(options: AiGenerateOptions, userId?: string): Promise<T> {
  const { provider } = await getActiveAiProvider(userId)
  return provider.generateStructuredJson<T>(options)
}
