"use client"

import { useState } from "react"
import { updateSettings } from "@/actions/settings"

type Settings = {
  minigamesEnabled: boolean
  minigameIntervalMin: number
  minigameIntervalMax: number
  speedMatchEnabled: boolean
  balloonPopEnabled: boolean
  reactionTesterEnabled: boolean
  wordDropEnabled: boolean
}

export function MinigameSettings({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState(initialSettings)
  const [isSaving, setIsSaving] = useState(false)

  const handleChange = async (key: keyof Settings, value: boolean | number) => {
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
        Minispiel-Pausen
        {isSaving && <span className="text-sm text-zinc-500 font-normal">Speichert...</span>}
      </h2>

      <div className="space-y-6">
        <label className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg cursor-pointer">
          <div>
            <div className="font-medium">Minispiel-Pausen aktivieren</div>
            <div className="text-sm text-zinc-500 mt-1">Zeigt gelegentlich kleine Minispiele zur Entspannung im Lernmodus an.</div>
          </div>
          <input
            type="checkbox"
            className="w-5 h-5 accent-blue-600 rounded cursor-pointer"
            checked={settings.minigamesEnabled}
            onChange={(e) => handleChange("minigamesEnabled", e.target.checked)}
          />
        </label>

        {settings.minigamesEnabled && (
          <div className="pl-4 border-l-2 border-zinc-200 dark:border-zinc-800 space-y-6 animate-in slide-in-from-top-2 opacity-100">
            <div>
              <div className="font-medium mb-2">Intervall</div>
              <div className="text-sm text-zinc-500 mb-4">Nach wie vielen gelernten Karten soll ein Minispiel erscheinen?</div>

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-xs text-zinc-500 mb-1 block">Minimum</label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={settings.minigameIntervalMin}
                    onChange={(e) => {
                       const val = parseInt(e.target.value) || 1
                       handleChange("minigameIntervalMin", val)
                       if (val > settings.minigameIntervalMax) {
                          handleChange("minigameIntervalMax", val)
                       }
                    }}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="text-zinc-400 mt-4">-</div>
                <div className="flex-1">
                  <label className="text-xs text-zinc-500 mb-1 block">Maximum</label>
                  <input
                    type="number"
                    min={settings.minigameIntervalMin}
                    max="1000"
                    value={settings.minigameIntervalMax}
                    onChange={(e) => {
                       const val = parseInt(e.target.value) || settings.minigameIntervalMin
                       handleChange("minigameIntervalMax", Math.max(val, settings.minigameIntervalMin))
                    }}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
              <div className="font-medium mb-4">Verfügbare Minispiele</div>
              <div className="space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm">Speed-Match (Paare verbinden)</span>
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                    checked={settings.speedMatchEnabled}
                    onChange={(e) => handleChange("speedMatchEnabled", e.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm">Balloon Pop (Motorische Entlastung)</span>
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                    checked={settings.balloonPopEnabled}
                    onChange={(e) => handleChange("balloonPopEnabled", e.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm">Reaktions-Tester (Reflex-Check)</span>
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                    checked={settings.reactionTesterEnabled}
                    onChange={(e) => handleChange("reactionTesterEnabled", e.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm">Wort-Regen (Fallende Vokabeln fangen)</span>
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                    checked={settings.wordDropEnabled}
                    onChange={(e) => handleChange("wordDropEnabled", e.target.checked)}
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
