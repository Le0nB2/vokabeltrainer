"use client"

import { useState } from "react"
import { ShieldCheck, ShieldAlert, KeyRound, Check, AlertCircle } from "lucide-react"
import { updateSettingsPasswordAction } from "@/actions/auth"

interface SettingsPasswordSettingsProps {
  isProtected: boolean
}

export function SettingsPasswordSettings({ isProtected: initialIsProtected }: SettingsPasswordSettingsProps) {
  const [isProtected, setIsProtected] = useState(initialIsProtected)
  const [isChanging, setIsChanging] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMessage(null)

    if (newPassword.trim().length < 4) {
      setError("Das Kennwort bzw. die PIN muss mindestens 4 Zeichen lang sein.")
      return
    }

    if (newPassword !== confirmPassword) {
      setError("Die eingegebenen Kennwörter stimmen nicht überein.")
      return
    }

    setLoading(true)
    try {
      const res = await updateSettingsPasswordAction({
        action: "change",
        newPassword: newPassword.trim(),
      })

      if (res.success) {
        setIsProtected(true)
        setIsChanging(false)
        setNewPassword("")
        setConfirmPassword("")
        setSuccessMessage("Kindersicherung erfolgreich aktualisiert!")
        setTimeout(() => setSuccessMessage(null), 4000)
      } else {
        setError(res.error || "Fehler beim Speichern.")
      }
    } catch {
      setError("Ein unerwarteter Fehler ist aufgetreten.")
    } finally {
      setLoading(false)
    }
  }

  const handleDisable = async () => {
    if (!window.confirm("Möchtest du die Kindersicherung wirklich deaktivieren? Die Einstellungen sind danach ohne Passwort zugänglich.")) {
      return
    }

    setLoading(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const res = await updateSettingsPasswordAction({
        action: "disable",
      })

      if (res.success) {
        setIsProtected(false)
        setIsChanging(false)
        setNewPassword("")
        setConfirmPassword("")
        setSuccessMessage("Kindersicherung wurde deaktiviert.")
        setTimeout(() => setSuccessMessage(null), 4000)
      } else {
        setError(res.error || "Fehler beim Deaktivieren.")
      }
    } catch {
      setError("Ein unerwarteter Fehler ist aufgetreten.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm mt-8">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${isProtected ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"}`}>
            {isProtected ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Kindersicherung (Einstellungen)
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                isProtected
                  ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700"
              }`}>
                {isProtected ? "Aktiviert" : "Deaktiviert"}
              </span>
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              Kindersicherung: Verhindert, dass Kinder beim Vokabellernen Einstellungen verändern.
            </p>
          </div>
        </div>
      </div>

      {successMessage && (
        <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!isChanging ? (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => {
              setIsChanging(true)
              setError(null)
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
          >
            <KeyRound className="w-4 h-4" />
            {isProtected ? "PIN / Kennwort ändern" : "Kindersicherung aktivieren"}
          </button>

          {isProtected && (
            <button
              type="button"
              disabled={loading}
              onClick={handleDisable}
              className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-sm font-medium transition-colors"
            >
              Schutz deaktivieren
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4 pt-2 max-w-md">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              {isProtected ? "Neues Kennwort / PIN" : "Kennwort / PIN (mind. 4 Zeichen)"}
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="z. B. 4-stellige PIN oder Kennwort"
              required
              minLength={4}
              className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Kennwort / PIN wiederholen
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Eingabe wiederholen"
              required
              minLength={4}
              className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? "Speichere..." : "Speichern"}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setIsChanging(false)
                setNewPassword("")
                setConfirmPassword("")
                setError(null)
              }}
              className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-sm font-medium transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
