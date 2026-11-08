"use client"

import { useState, useEffect } from "react"
import { updateSettings, syncAiModelsAction } from "@/actions/settings"
import {
  getAiConfigStatus,
  saveAiKeyAction,
  setActiveAiProviderAction,
  disconnectAiProviderAction,
  type AiConfigStatus,
} from "@/actions/ai-credentials"
import {
  Sparkles,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Key,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import { ApiUsageChart } from "@/components/ApiUsageChart"
import type { ApiStatsResult } from "@/actions/api-stats"

type ModelItem = {
  id: string
  name: string
  displayName: string
  description: string | null
}

type Settings = {
  selectedModel?: string
  activeAiProvider?: string
}

export function AiModelSettings({
  initialSettings,
  initialModels,
  apiStats,
}: {
  initialSettings: Settings
  initialModels: ModelItem[]
  apiStats?: ApiStatsResult[]
}) {
  const [selectedModel, setSelectedModel] = useState(
    initialSettings.selectedModel ?? "gemini-3.6-flash"
  )
  const [activeProvider, setActiveProvider] = useState<"gemini" | "openrouter" | "openai">(
    initialSettings.activeAiProvider === "openrouter"
      ? "openrouter"
      : initialSettings.activeAiProvider === "openai"
      ? "openai"
      : "gemini"
  )
  const [aiStatus, setAiStatus] = useState<AiConfigStatus | null>(null)
  const [geminiKeyInput, setGeminiKeyInput] = useState("")
  const [openRouterKeyInput, setOpenRouterKeyInput] = useState("")
  const [openAiKeyInput, setOpenAiKeyInput] = useState("")
  const [isSavingKey, setIsSavingKey] = useState(false)
  const [models, setModels] = useState<ModelItem[]>(initialModels)
  const [stats, setStats] = useState<ApiStatsResult[] | undefined>(apiStats)
  const [isSaving, setIsSaving] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [feedback, setFeedback] = useState<{
    type: "success" | "error"
    message: string
  } | null>(null)

  useEffect(() => {
    setStats(apiStats)
  }, [apiStats])

  useEffect(() => {
    getAiConfigStatus().then((status) => {
      setAiStatus(status)
      setActiveProvider(status.activeProvider)
    })

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const connected = params.get("ai_connected")
      const error = params.get("ai_error")
      if (connected === "openrouter") {
        setFeedback({
          type: "success",
          message: "OpenRouter erfolgreich verknüpft! Alle KI-Funktionen sind jetzt aktiv.",
        })
        const url = new URL(window.location.href)
        url.searchParams.delete("ai_connected")
        window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ""))
      } else if (error) {
        setFeedback({
          type: "error",
          message: decodeURIComponent(error),
        })
        const url = new URL(window.location.href)
        url.searchParams.delete("ai_error")
        window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ""))
      }
    }
  }, [])

  const handleProviderSwitch = async (newProvider: "gemini" | "openrouter" | "openai") => {
    setActiveProvider(newProvider)
    setFeedback(null)
    try {
      await setActiveAiProviderAction(newProvider)
      const providerLabel =
        newProvider === "gemini"
          ? "Google Gemini"
          : newProvider === "openai"
          ? "ChatGPT (OpenAI)"
          : "OpenRouter"
      setFeedback({
        type: "success",
        message: `Aktiver KI-Dienst auf ${providerLabel} umgestellt.`,
      })
    } catch {
      setFeedback({
        type: "error",
        message: "Fehler beim Wechseln des KI-Dienstes.",
      })
    }
  }

  const handleSaveGeminiKey = async () => {
    if (!geminiKeyInput.trim()) return
    setIsSavingKey(true)
    setFeedback(null)
    try {
      const res = await saveAiKeyAction("gemini_key", geminiKeyInput.trim(), true)
      if (res.success) {
        setGeminiKeyInput("")
        const status = await getAiConfigStatus()
        setAiStatus(status)
        setFeedback({
          type: "success",
          message: "Google AI Studio Key erfolgreich verschlüsselt gespeichert!",
        })
      } else {
        setFeedback({ type: "error", message: res.error || "Fehler beim Speichern." })
      }
    } finally {
      setIsSavingKey(false)
    }
  }

  const handleSaveOpenRouterKey = async () => {
    if (!openRouterKeyInput.trim()) return
    setIsSavingKey(true)
    setFeedback(null)
    try {
      const res = await saveAiKeyAction("openrouter_key", openRouterKeyInput.trim(), true)
      if (res.success) {
        setOpenRouterKeyInput("")
        const status = await getAiConfigStatus()
        setAiStatus(status)
        setFeedback({
          type: "success",
          message: "OpenRouter API-Key erfolgreich verschlüsselt gespeichert!",
        })
      } else {
        setFeedback({ type: "error", message: res.error || "Fehler beim Speichern." })
      }
    } finally {
      setIsSavingKey(false)
    }
  }

  const handleSaveOpenAiKey = async () => {
    if (!openAiKeyInput.trim()) return
    setIsSavingKey(true)
    setFeedback(null)
    try {
      const res = await saveAiKeyAction("openai_key", openAiKeyInput.trim(), true)
      if (res.success) {
        setOpenAiKeyInput("")
        const status = await getAiConfigStatus()
        setAiStatus(status)
        setFeedback({
          type: "success",
          message: "OpenAI API-Key erfolgreich verschlüsselt gespeichert!",
        })
      } else {
        setFeedback({ type: "error", message: res.error || "Fehler beim Speichern." })
      }
    } finally {
      setIsSavingKey(false)
    }
  }

  const handleDisconnect = async (provider: "gemini" | "openrouter" | "openai") => {
    const providerLabel =
      provider === "gemini"
        ? "Google Gemini"
        : provider === "openai"
        ? "ChatGPT (OpenAI)"
        : "OpenRouter"
    if (!confirm(`Möchtest du die hinterlegten Zugangsdaten für ${providerLabel} wirklich entfernen?`)) {
      return
    }
    setFeedback(null)
    try {
      await disconnectAiProviderAction(provider)
      const status = await getAiConfigStatus()
      setAiStatus(status)
      setFeedback({
        type: "success",
        message: `Zugangsdaten für ${providerLabel} entfernt.`,
      })
    } catch {
      setFeedback({ type: "error", message: "Fehler beim Trennen." })
    }
  }

  const handleModelChange = async (newModel: string) => {
    setSelectedModel(newModel)
    setIsSaving(true)
    setFeedback(null)
    try {
      await updateSettings({ selectedModel: newModel })
    } catch (err) {
      console.error("Fehler beim Speichern des Modells:", err)
      setFeedback({
        type: "error",
        message: "Fehler beim Speichern des Modells.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleRefreshModels = async () => {
    setIsRefreshing(true)
    setFeedback(null)
    try {
      const res = await syncAiModelsAction()
      if (res.apiStats) {
        setStats(res.apiStats)
      }
      if (res.success) {
        setFeedback({
          type: "success",
          message: `${res.count} für die Anwendung geeignete Modelle von Google synchronisiert.`,
        })
        const { getAvailableAiModelsAction } = await import("@/actions/settings")
        const updated = await getAvailableAiModelsAction()
        setModels(updated)
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Modelle konnten nicht abgerufen werden.",
        })
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Unerwarteter Fehler beim Abruf der Modelle.",
      })
    } finally {
      setIsRefreshing(false)
    }
  }

  const isPaidSelected = selectedModel.toLowerCase().includes("pro")
  const flashLiteModels = models.filter((m) => m.id.includes("lite"))
  const proModels = models.filter((m) => m.id.includes("pro"))
  const flashModels = models.filter((m) => !m.id.includes("lite") && !m.id.includes("pro"))

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm mt-8 space-y-6">
      {/* 1. Header & Provider Selector */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-blue-600 shrink-0" />
            <h2 className="text-xl font-bold">KI-Dienst & Authentifizierung</h2>
          </div>
        </div>
        <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
          Wähle aus, welcher Dienst die KI-Funktionen (Vokabel-Scan per Foto, Eselsbrücken, Lückentexte und Arbeitsblätter) bereitstellt.
        </p>

        {/* Provider Switch Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <button
            type="button"
            onClick={() => handleProviderSwitch("gemini")}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              activeProvider === "gemini"
                ? "border-blue-600 bg-blue-50/40 dark:bg-blue-950/20"
                : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                🔵 Google Gemini
              </span>
              {activeProvider === "gemini" && (
                <span className="text-xs bg-blue-600 text-white font-medium px-2 py-0.5 rounded-full">
                  Aktiv
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Kostenloses Kontingent über Google AI Studio (15 RPM / 1M TPM).
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleProviderSwitch("openrouter")}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              activeProvider === "openrouter"
                ? "border-purple-600 bg-purple-50/40 dark:bg-purple-950/20"
                : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                🟣 OpenRouter
              </span>
              {activeProvider === "openrouter" && (
                <span className="text-xs bg-purple-600 text-white font-medium px-2 py-0.5 rounded-full">
                  Aktiv
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              1-Klick OAuth Login, hunderte Modelle (GPT-4o, Claude, Llama Free).
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleProviderSwitch("openai")}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              activeProvider === "openai"
                ? "border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20"
                : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                🟢 ChatGPT (OpenAI)
              </span>
              {activeProvider === "openai" && (
                <span className="text-xs bg-emerald-600 text-white font-medium px-2 py-0.5 rounded-full">
                  Aktiv
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Direkte OpenAI API für GPT-4o und GPT-4o-mini Bild- und Textverarbeitung.
            </p>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-start gap-3 p-3 rounded-lg text-sm ${
            feedback.type === "success"
              ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-300"
              : "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* 2. Provider Details Configuration */}
      {activeProvider === "openrouter" ? (
        <div className="p-4 bg-purple-50/30 dark:bg-purple-950/10 border border-purple-200 dark:border-purple-900/40 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
              OpenRouter Verbindung
            </span>
            {aiStatus?.hasOpenRouterKey ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" /> Verbunden
              </span>
            ) : (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                Nicht verbunden
              </span>
            )}
          </div>

          <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-xs text-purple-950 dark:text-purple-200 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-purple-900 dark:text-purple-100">
              <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <span>Hinweis zur 1-Klick-Anbindung:</span>
            </div>
            <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Du wirst zu <strong>OpenRouter</strong> weitergeleitet. Bitte melde dich dort an (oder erstelle kostenlos ein Konto) und klicke auf <strong>„Authorize“</strong>, um den N30 Vokabeltrainer zu autorisieren. Du wirst danach automatisch wieder hierher zurückgeführt.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`/api/auth/openrouter/login?returnTo=${encodeURIComponent("/settings")}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs sm:text-sm font-medium transition-colors shadow-sm"
            >
              <Sparkles className="w-4 h-4" /> Mit OpenRouter verbinden (1-Klick)
            </a>

            {aiStatus?.hasOpenRouterKey && (
              <button
                type="button"
                onClick={() => handleDisconnect("openrouter")}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Verbindung trennen
              </button>
            )}
          </div>

          <div className="pt-3 border-t border-purple-100 dark:border-purple-900/30">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Oder API-Key manuell hinterlegen:
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={openRouterKeyInput}
                onChange={(e) => setOpenRouterKeyInput(e.target.value)}
                placeholder="sk-or-v1-..."
                className="flex-1 px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                type="button"
                disabled={isSavingKey}
                onClick={handleSaveOpenRouterKey}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-medium disabled:opacity-50"
              >
                {isSavingKey ? "Speichert..." : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      ) : activeProvider === "openai" ? (
        <div className="p-4 bg-emerald-50/30 dark:bg-emerald-950/10 border border-emerald-200 dark:border-emerald-900/40 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
              ChatGPT (OpenAI) Verbindung
            </span>
            {aiStatus?.hasOpenAiKey ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" /> Eigener Key hinterlegt
              </span>
            ) : aiStatus?.hasEnvOpenAiKey ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                <ShieldCheck className="w-3.5 h-3.5" /> Server-Schlüssel aktiv (.env)
              </span>
            ) : (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                Kein Schlüssel hinterlegt
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              OpenAI API-Schlüssel eintragen:
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={openAiKeyInput}
                onChange={(e) => setOpenAiKeyInput(e.target.value)}
                placeholder="sk-proj-..."
                className="flex-1 px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                disabled={isSavingKey}
                onClick={handleSaveOpenAiKey}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-medium disabled:opacity-50"
              >
                {isSavingKey ? "Speichert..." : "Speichern"}
              </button>
            </div>
            <div className="flex items-center justify-between mt-2">
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-emerald-600 hover:underline inline-flex items-center gap-1 font-medium"
              >
                API-Key auf platform.openai.com erstellen <ExternalLink className="w-3 h-3" />
              </a>
              {aiStatus?.hasOpenAiKey && (
                <button
                  type="button"
                  onClick={() => handleDisconnect("openai")}
                  className="inline-flex items-center gap-1 text-xs text-rose-600 hover:underline"
                >
                  <Trash2 className="w-3 h-3" /> Key löschen
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-blue-50/30 dark:bg-blue-950/10 border border-blue-200 dark:border-blue-900/40 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
              Google AI Studio Key
            </span>
            {aiStatus?.hasGeminiKey ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" /> Eigener Key hinterlegt
              </span>
            ) : aiStatus?.hasEnvGeminiKey ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                <ShieldCheck className="w-3.5 h-3.5" /> Server-Schlüssel aktiv (.env)
              </span>
            ) : (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                Kein Schlüssel hinterlegt
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Google AI Studio API-Schlüssel eintragen (mehrere Keys kommagetrennt für automatisches Fallback &amp; mehr Kontingent):
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={geminiKeyInput}
                onChange={(e) => setGeminiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="flex-1 px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                disabled={isSavingKey}
                onClick={handleSaveGeminiKey}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium disabled:opacity-50"
              >
                {isSavingKey ? "Speichert..." : "Speichern"}
              </button>
            </div>
            <div className="flex items-center justify-between mt-2">
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 font-medium"
              >
                Kostenlosen Key im Google AI Studio holen <ExternalLink className="w-3 h-3" />
              </a>
              {aiStatus?.hasGeminiKey && (
                <button
                  type="button"
                  onClick={() => handleDisconnect("gemini")}
                  className="inline-flex items-center gap-1 text-xs text-rose-600 hover:underline"
                >
                  <Trash2 className="w-3 h-3" /> Key löschen
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. API-Chart & Gemini Model Details (when Gemini is active) */}
      {activeProvider === "gemini" && (
        <>
          {stats && (
            <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
              <ApiUsageChart data={stats} embedded />
            </div>
          )}

          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Gemini Modell-Auswahl
              </h3>
              <button
                type="button"
                onClick={handleRefreshModels}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer self-start sm:self-auto"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-600" : ""}`}
                />
                {isRefreshing ? "Rufe Modelle ab..." : "Modelle jetzt abrufen"}
              </button>
            </div>

            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-zinc-900 dark:text-zinc-100 text-sm">
                    Aktives Gemini-Modell
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    Wähle das Modell für Vokabel-Scan, Eselsbrücken und Arbeitsblätter.
                  </div>
                </div>

                <select
                  className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-md py-2 px-3 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-80"
                  value={selectedModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                >
                  {!models.some((m) => m.id === selectedModel) && (
                    <option value={selectedModel}>{selectedModel}</option>
                  )}

                  {flashLiteModels.length > 0 && (
                    <optgroup label="Flash-Lite (Kostenlos / Free Tier)">
                      {flashLiteModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName} [Free Tier]
                        </option>
                      ))}
                    </optgroup>
                  )}

                  {flashModels.length > 0 && (
                    <optgroup label="Flash (Kostenlos / Free Tier)">
                      {flashModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName} [Free Tier]
                        </option>
                      ))}
                    </optgroup>
                  )}

                  {proModels.length > 0 && (
                    <optgroup label="Pro (Kostenpflichtig / Paid API)">
                      {proModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName} [Paid API]
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {isPaidSelected ? (
                <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs">
                  <CreditCard className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <div>
                    <span className="font-semibold">Paid API erforderlich:</span> Pro-Modelle setzen ein Google AI Studio Abrechnungskonto voraus.
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 text-green-800 dark:text-green-300 text-xs">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600 dark:text-green-400" />
                  <span>Kostenloses Modell (im Google Free Tier enthalten)</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
