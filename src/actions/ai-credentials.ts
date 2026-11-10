"use server"

import prisma from "@/lib/prisma"
import { encryptSecret } from "@/lib/security/crypto"
import { requireAppAuth, getCurrentUser } from "@/lib/auth-guard"
import { checkSettingsAuthenticated } from "@/actions/auth"
import { getSetupState } from "@/actions/setup"
import { revalidatePath } from "next/cache"

async function requireAdminOrSetupAuth(): Promise<void> {
  const setupState = await getSetupState()
  if (setupState.needsSetup) return

  await requireAppAuth()
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") {
    throw new Error("Nur Administratoren dürfen KI-Zugangsdaten verwalten.")
  }
  const isSettingsAuth = await checkSettingsAuthenticated()
  if (!isSettingsAuth) {
    throw new Error("Bitte entsperre zuerst die Einstellungen mit deiner PIN.")
  }
}

export interface AiConfigStatus {
  activeProvider: "gemini" | "openrouter" | "openai"
  hasGeminiKey: boolean
  hasOpenRouterKey: boolean
  hasOpenAiKey: boolean
  hasEnvGeminiKey: boolean
  hasEnvOpenRouterKey: boolean
  hasEnvOpenAiKey: boolean
}

export async function getAiConfigStatus(): Promise<AiConfigStatus> {
  let activeProvider: "gemini" | "openrouter" | "openai" = "gemini"
  try {
    const settings = await prisma.settings.findUnique({ where: { id: "default" } })
    if (settings?.activeAiProvider === "gemini") {
      activeProvider = "gemini"
    } else if (settings?.activeAiProvider === "openai") {
      activeProvider = "openai"
    } else if (settings?.activeAiProvider === "openrouter") {
      activeProvider = "openrouter"
    }
  } catch {
    // ignore
  }

  const user = await getCurrentUser()
  const userId = user?.id

  let hasGeminiKey = false
  let hasOpenRouterKey = false
  let hasOpenAiKey = false

  try {
    const creds = await prisma.userAiCredential.findMany({
      where: {
        OR: [
          ...(userId ? [{ userId }] : []),
          { userId: null },
        ],
      },
    })

    hasGeminiKey = creds.some((c) => c.provider === "gemini_key" && Boolean(c.apiKey))
    hasOpenRouterKey = creds.some(
      (c) =>
        (c.provider === "openrouter_key" || c.provider === "openrouter_oauth") &&
        Boolean(c.apiKey || c.accessToken)
    )
    hasOpenAiKey = creds.some((c) => c.provider === "openai_key" && Boolean(c.apiKey))
  } catch {
    // ignore
  }

  const hasEnvGeminiKey = Boolean(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS)
  const hasEnvOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY)
  const hasEnvOpenAiKey = Boolean(process.env.OPENAI_API_KEY)

  return {
    activeProvider,
    hasGeminiKey,
    hasOpenRouterKey,
    hasOpenAiKey,
    hasEnvGeminiKey,
    hasEnvOpenRouterKey,
    hasEnvOpenAiKey,
  }
}

export async function saveAiKeyAction(
  provider: "gemini_key" | "openrouter_key" | "openai_key",
  rawKey: string,
  isGlobal = true
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminOrSetupAuth()
  } catch (authErr: any) {
    return { success: false, error: authErr.message }
  }

  let cleanKey = rawKey?.trim()
  if (!cleanKey) {
    return { success: false, error: "Der API-Schlüssel darf nicht leer sein." }
  }

  if (provider === "gemini_key") {
    // Normalisiere kommagetrennte Keys (z.B. "key1, key2"), damit jeder einzelne Key sauber getrimmt wird
    cleanKey = cleanKey
      .split(/[,\n;]+/)
      .map((k) => k.trim())
      .filter(Boolean)
      .join(",")
  }

  const user = await getCurrentUser()
  const targetUserId = isGlobal ? null : user?.id || null

  try {
    const encrypted = encryptSecret(cleanKey)
    const existing = await prisma.userAiCredential.findFirst({
      where: {
        userId: targetUserId,
        provider,
      },
    })

    if (existing) {
      await prisma.userAiCredential.update({
        where: { id: existing.id },
        data: { apiKey: encrypted },
      })
    } else {
      await prisma.userAiCredential.create({
        data: {
          userId: targetUserId,
          provider,
          apiKey: encrypted,
        },
      })
    }

    const activeProvider =
      provider === "gemini_key"
        ? "gemini"
        : provider === "openai_key"
        ? "openai"
        : "openrouter"
    await prisma.settings.upsert({
      where: { id: "default" },
      update: { activeAiProvider: activeProvider },
      create: { id: "default", activeAiProvider: activeProvider },
    })

    revalidatePath("/settings")
    revalidatePath("/setup")
    return { success: true }
  } catch (err: any) {
    console.error("saveAiKeyAction error:", err)
    return { success: false, error: "Fehler beim Speichern des Schlüssels." }
  }
}

export async function setActiveAiProviderAction(
  provider: "gemini" | "openrouter" | "openai"
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminOrSetupAuth()
  } catch (authErr: any) {
    return { success: false, error: authErr.message }
  }

  try {
    await prisma.settings.upsert({
      where: { id: "default" },
      update: { activeAiProvider: provider },
      create: { id: "default", activeAiProvider: provider },
    })
    revalidatePath("/settings")
    return { success: true }
  } catch (err: any) {
    console.error("setActiveAiProviderAction error:", err)
    return { success: false, error: "Fehler beim Wechseln des KI-Dienstes." }
  }
}

export async function disconnectAiProviderAction(
  provider: "gemini" | "openrouter" | "openai"
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminOrSetupAuth()
  } catch (authErr: any) {
    return { success: false, error: authErr.message }
  }

  const user = await getCurrentUser()
  const userId = user?.id

  try {
    const providerFilter =
      provider === "gemini"
        ? ["gemini_key"]
        : provider === "openai"
        ? ["openai_key"]
        : ["openrouter_key", "openrouter_oauth"]

    await prisma.userAiCredential.deleteMany({
      where: {
        provider: { in: providerFilter },
        OR: [
          ...(userId ? [{ userId }] : []),
          { userId: null },
        ],
      },
    })

    revalidatePath("/settings")
    revalidatePath("/setup")
    return { success: true }
  } catch (err: any) {
    console.error("disconnectAiProviderAction error:", err)
    return { success: false, error: "Fehler beim Trennen der Verbindung." }
  }
}
