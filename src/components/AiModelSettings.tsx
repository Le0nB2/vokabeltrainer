"use client"

import { useState } from "react"
import { updateSettings, syncAiModelsAction } from "@/actions/settings"
import { Sparkles, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react"

type ModelItem = {
  id: string
  name: string
  displayName: string
  description: string | null
}

type Settings = {
  selectedModel?: string
}

export function AiModelSettings({
  initialSettings,
  initialModels,
}: {
  initialSettings: Settings
  initialModels: ModelItem[]
}) {
  const [selectedModel, setSelectedModel] = useState(
    initialSettings.selectedModel ?? "gemini-3.5-flash-lite"
  )
  const [models, setModels] = useState<ModelItem[]>(initialModels)
  const [isSaving, setIsSaving] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [feedback, setFeedback] = useState<{
    type: "success" | "error"
    message: string
  } | null>(null)

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
      if (res.success) {
        setFeedback({
          type: "success",
          message: `${res.count} Modelle erfolgreich von Google abgerufen und gespeichert.`,
        })
        // Fetch updated models list
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

  const currentModelInfo = models.find((m) => m.id === selectedModel)

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 mt-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-600 shrink-0" />
          <h2 className="text-xl font-semibold">KI-Modell (Google Gemini)</h2>
          {isSaving && (
            <span className="text-sm text-zinc-500 font-normal ml-2">
              Speichert...
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleRefreshModels}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed self-start sm:self-auto"
        >
          <RefreshCw
            className={`w-4 h-4 ${isRefreshing ? "animate-spin text-blue-600" : ""}`}
          />
          {isRefreshing ? "Rufe Modelle ab..." : "Modelle jetzt abrufen"}
        </button>
      </div>

      {feedback && (
        <div
          className={`flex items-start gap-3 p-3 mb-6 rounded-lg text-sm ${
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

      <div className="space-y-4">
        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="font-medium text-zinc-900 dark:text-zinc-100">
                Aktives Modell
              </div>
              <div className="text-sm text-zinc-500 mt-1">
                Wähle das Modell, das für Scan, Eselsbrücken und Arbeitsblätter genutzt wird.
              </div>
            </div>

            <select
              className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-80"
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
            >
              {/* If selectedModel is not in models list yet, show it as selected option */}
              {!models.some((m) => m.id === selectedModel) && (
                <option value={selectedModel}>{selectedModel}</option>
              )}
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName} ({model.id})
                </option>
              ))}
            </select>
          </div>

          {currentModelInfo?.description && (
            <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700/60 text-xs text-zinc-500">
              <span className="font-medium">Beschreibung:</span> {currentModelInfo.description}
            </div>
          )}
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Die Modelle sind in der lokalen Datenbank gespeichert. Ein Abruf bei Google findet
          ausschließlich beim Klick auf &bdquo;Modelle jetzt abrufen&ldquo; statt, um API-Kontingente zu schonen.
        </p>
      </div>
    </div>
  )
}
