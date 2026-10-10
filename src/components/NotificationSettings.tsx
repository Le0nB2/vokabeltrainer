"use client"

import { useState } from "react"
import { updateSettings } from "@/actions/settings"

type Settings = {
  notificationsEnabled?: boolean
}

export function NotificationSettings({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState({ notificationsEnabled: initialSettings.notificationsEnabled ?? false })
  const [isSaving, setIsSaving] = useState(false)

  const handleChange = async (key: keyof Settings, value: boolean) => {
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
        Benachrichtigungen
        {isSaving && <span className="text-sm text-zinc-500 font-normal">Speichert...</span>}
      </h2>

      <div className="space-y-6">
        <label className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg cursor-pointer">
          <div>
            <div className="font-medium">Tägliche Erinnerung aktivieren</div>
            <div className="text-sm text-zinc-500 mt-1">Ermöglicht Home Assistant (oder anderen externen Systemen), fällige Vokabeln abzufragen und dich zu erinnern.</div>
          </div>
          <input
            type="checkbox"
            className="w-5 h-5 accent-blue-600 rounded cursor-pointer"
            checked={settings.notificationsEnabled}
            onChange={(e) => handleChange("notificationsEnabled", e.target.checked)}
          />
        </label>
      </div>
    </div>
  )
}
