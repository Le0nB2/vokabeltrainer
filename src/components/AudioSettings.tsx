"use client"

import { useState } from "react"
import { updateSettings } from "@/actions/settings"

type Settings = {
  speechLanguage?: string
}

export function AudioSettings({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState({ speechLanguage: initialSettings.speechLanguage ?? 'en-GB' })
  const [isSaving, setIsSaving] = useState(false)

  const handleChange = async (key: keyof Settings, value: string) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    setIsSaving(true)
    try {
      await updateSettings({ [key]: value })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 mt-8">
      <h2 className="text-xl font-semibold mb-6 flex items-center justify-between">
        Audio
        {isSaving && <span className="text-sm text-zinc-500 font-normal">Speichert...</span>}
      </h2>

      <div className="space-y-6">
        <label className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg cursor-pointer">
          <div>
            <div className="font-medium">Sprache für Vorlesefunktion</div>
            <div className="text-sm text-zinc-500 mt-1">Wähle den bevorzugten Dialekt.</div>
          </div>
          <select
            className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto"
            value={settings.speechLanguage}
            onChange={(e) => handleChange("speechLanguage", e.target.value)}
          >
            <option value="en-GB">Britisches Englisch (UK)</option>
            <option value="en-US">US-Englisch (US)</option>
          </select>
        </label>
      </div>
    </div>
  )
}
