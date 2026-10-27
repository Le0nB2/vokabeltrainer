"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ShieldCheck,
  User,
  Users,
  Lock,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
} from "lucide-react"
import { completeSetupSingleUser, completeSetupProtected } from "@/actions/setup"

interface SetupWizardProps {
  isPublicOrRender: boolean
}

export function SetupWizard({ isPublicOrRender }: SetupWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 2 Form States
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [settingsOption, setSettingsOption] = useState<"same" | "pin" | "none">("same")
  const [customPin, setCustomPin] = useState("")

  const handleStartSingleUser = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await completeSetupSingleUser()
      if (res.success) {
        router.push("/")
        router.refresh()
      } else {
        setError(res.error || "Fehler beim Abschließen der Einrichtung.")
        setLoading(false)
      }
    } catch {
      setError("Ein unerwarteter Fehler ist aufgetreten.")
      setLoading(false)
    }
  }

  const handleSingleUserClick = () => {
    if (isPublicOrRender) {
      setShowWarningModal(true)
    } else {
      setShowWarningModal(true) // Always verify awareness to be safe
    }
  }

  const handleProtectedSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!username.trim() || username.trim().length < 2) {
      setError("Der Anmeldename muss mindestens 2 Zeichen lang sein.")
      return
    }

    if (password.length < 6) {
      setError("Das Passwort muss mindestens 6 Zeichen lang sein.")
      return
    }

    if (password !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein.")
      return
    }

    if (settingsOption === "pin" && (!customPin.trim() || customPin.trim().length < 4)) {
      setError("Die Kindersicherungs-PIN muss mindestens 4 Zeichen lang sein.")
      return
    }

    setLoading(true)
    try {
      const res = await completeSetupProtected({
        username: username.trim(),
        password,
        settingsOption,
        customPin: settingsOption === "pin" ? customPin.trim() : undefined,
      })

      if (res.success) {
        router.push("/")
        router.refresh()
      } else {
        setError(res.error || "Fehler beim Einrichten.")
        setLoading(false)
      }
    } catch {
      setError("Ein unerwarteter Fehler ist aufgetreten.")
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Top Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 mb-3 shadow-sm">
          <Sparkles className="w-7 h-7" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
          Willkommen beim Vokabeltrainer! 👋
        </h1>
        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 mt-2 max-w-md mx-auto">
          {step === 1
            ? "Wähle bitte, wie du den Vokabeltrainer auf diesem System nutzen möchtest:"
            : "Richte dein Eltern-Konto und die Kindersicherung ein."}
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl text-sm text-rose-700 dark:text-rose-300 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Screen 1: Mode Selection */}
      {step === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Option A: Geschützter Modus (Recommended) */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border-2 border-blue-500/70 dark:border-blue-500 shadow-md flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-4 right-4 bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-blue-200 dark:border-blue-800">
              Empfohlen
            </div>

            <div>
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4">
                <Users className="w-6 h-6" />
              </div>

              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">
                Geschützter Modus
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                Ideal für Familien, mehrere Profile und für öffentliche Server im Internet.
              </p>

              <ul className="space-y-2.5 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Benutzerkonten mit eigenem Fortschritt</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Kindersicherung für Einstellungen</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Sicherer Login mit Passwort</span>
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <span>Geschützt einrichten</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Option B: Einzelnutzer-Modus */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 flex items-center justify-center mb-4">
                <User className="w-6 h-6" />
              </div>

              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">
                Einzelnutzer-Modus
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                Schnellstart ohne Benutzerkonto für rein private lokale Heimnetzwerke.
              </p>

              <ul className="space-y-2.5 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 mb-4">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>Kein Anmeldename oder Login nötig</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>Alle Vokabeln in einer Übersicht</span>
                </li>
              </ul>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl mb-6">
                <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <span>Nicht für öffentliche Seiten im Internet (z. B. Render) geeignet!</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleSingleUserClick}
              className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl font-medium text-sm transition-colors"
            >
              Als Einzelnutzer starten
            </button>
          </div>
        </div>
      )}

      {/* Screen 2: Protected Setup Form */}
      {step === 2 && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 sm:p-8 border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <button
            type="button"
            onClick={() => {
              setStep(1)
              setError(null)
            }}
            className="inline-flex items-center gap-2 text-xs sm:text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Zurück zur Modus-Auswahl
          </button>

          <form onSubmit={handleProtectedSubmit} className="space-y-6">
            {/* Account Information */}
            <div className="space-y-4">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 pb-1 border-b border-zinc-100 dark:border-zinc-800">
                1. Eltern- / Administrator-Konto
              </h2>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Anmeldename *
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="z. B. Papa, Mama oder Admin"
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Anmeldepasswort *
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mindestens 6 Zeichen"
                    required
                    minLength={6}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Passwort bestätigen *
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Passwort wiederholen"
                    required
                    minLength={6}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Kindersicherung / Settings Protection */}
            <div className="space-y-3 pt-2">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 pb-1 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                2. Kindersicherung für Einstellungen
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Kindersicherung: Verhindert, dass Kinder beim Vokabellernen Einstellungen verändern.
              </p>

              <div className="space-y-2.5 pt-1">
                <label className="flex items-start gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="settingsOption"
                    value="same"
                    checked={settingsOption === "same"}
                    onChange={() => setSettingsOption("same")}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="text-xs sm:text-sm">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      Gleiches Passwort wie Anmeldekennwort verwenden
                    </span>
                    <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">
                      Bequem: Du musst dir nur ein Passwort merken.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="settingsOption"
                    value="pin"
                    checked={settingsOption === "pin"}
                    onChange={() => setSettingsOption("pin")}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="text-xs sm:text-sm w-full">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      Eigene PIN vergeben (z. B. 4-stellige Zahl)
                    </span>
                    <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">
                      Ermöglicht schnelles Entsperren mit einer einfachen Zahl.
                    </p>
                    {settingsOption === "pin" && (
                      <div className="mt-3">
                        <input
                          type="password"
                          value={customPin}
                          onChange={(e) => setCustomPin(e.target.value)}
                          placeholder="z. B. 1234 (mindestens 4 Zeichen)"
                          minLength={4}
                          required={settingsOption === "pin"}
                          className="w-full max-w-xs px-3.5 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="settingsOption"
                    value="none"
                    checked={settingsOption === "none"}
                    onChange={() => setSettingsOption("none")}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="text-xs sm:text-sm">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      Kindersicherung deaktivieren
                    </span>
                    <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">
                      Einstellungen können direkt ohne Passworteingabe geöffnet werden.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {loading ? "Richte Vokabeltrainer ein..." : "Einrichtung abschließen 🚀"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Safety Warning Modal for Single-User Mode */}
      {showWarningModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800">
            <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              Wichtiger Sicherheitshinweis
            </h3>

            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">
              Du möchtest den Vokabeltrainer <strong>ohne Passwort</strong> starten.
            </p>

            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl text-xs text-amber-900 dark:text-amber-200 mb-6 leading-relaxed">
              ⚠️ Wenn diese Seite öffentlich im Internet erreichbar ist (z. B. auf Render),
              kann jede Person ohne Anmeldung deine Vokabeln einsehen und verändern!
              <br />
              <br />
              Nutze den Einzelnutzer-Modus bitte nur, wenn die App privat auf deinem eigenen Gerät oder im lokalen Heimnetzwerk läuft.
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowWarningModal(false)
                  setStep(2)
                }}
                className="w-full sm:w-auto flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-medium transition-colors"
              >
                Doch Passwort anlegen
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleStartSingleUser}
                className="w-full sm:w-auto py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs sm:text-sm font-medium transition-colors"
              >
                {loading ? "Starte..." : "Ich bin privat / Starten"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
