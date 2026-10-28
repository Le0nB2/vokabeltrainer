"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ShieldCheck,
  User,
  Users,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  UserPlus,
} from "lucide-react"
import { completeSetupSingleUser, completeSetupProtected } from "@/actions/setup"

interface SetupWizardProps {
  isPublicOrRender: boolean
}

export function SetupWizard({ isPublicOrRender }: SetupWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [showSingleUserModal, setShowSingleUserModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Single-User Mode PIN States
  const [singleUserPin, setSingleUserPin] = useState("")
  const [singleUserPinConfirm, setSingleUserPinConfirm] = useState("")

  // Step 2 Form States (Parent / Admin)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [settingsPin, setSettingsPin] = useState("")
  const [settingsPinConfirm, setSettingsPinConfirm] = useState("")

  // Step 3 Form States (Child Account)
  const [createChild, setCreateChild] = useState<boolean>(true)
  const [childDisplayName, setChildDisplayName] = useState("")
  const [childUsername, setChildUsername] = useState("")
  const [hasManuallyEditedChildUsername, setHasManuallyEditedChildUsername] = useState(false)
  const [childPassword, setChildPassword] = useState("")
  const [childConfirmPassword, setChildConfirmPassword] = useState("")

  const handleStartSingleUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError(null)

    if (singleUserPin.trim().length > 0) {
      if (singleUserPin.trim().length < 4) {
        setError("Die Einstellungs-PIN muss mindestens 4 Zeichen lang sein.")
        return
      }
      if (singleUserPin !== singleUserPinConfirm) {
        setError("Die Einstellungs-PINs stimmen nicht überein.")
        return
      }
    }

    setLoading(true)
    try {
      const res = await completeSetupSingleUser({
        settingsPin: singleUserPin.trim() || undefined,
      })
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

  const handleProceedToChildStep = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError(null)

    const cleanUsername = username.trim()
    if (!cleanUsername || cleanUsername.length < 2 || cleanUsername.length > 50) {
      setError("Der Eltern-Benutzername muss zwischen 2 und 50 Zeichen lang sein.")
      return
    }

    if (!/^[a-zA-Z0-9_\-\.]+$/.test(cleanUsername)) {
      setError("Der Eltern-Benutzername darf nur Buchstaben, Zahlen, Bindestriche und Punkte enthalten.")
      return
    }

    if (cleanUsername.toLowerCase() === "default" || cleanUsername.toLowerCase() === "env-admin") {
      setError("Dieser Benutzername ist reserviert.")
      return
    }

    if (password.length < 8 || !/[^a-zA-Z0-9]/.test(password)) {
      setError("Das Eltern-Passwort muss mindestens 8 Zeichen lang sein und mindestens ein Sonderzeichen enthalten.")
      return
    }

    if (password !== confirmPassword) {
      setError("Die Passwörter für das Eltern-Konto stimmen nicht überein.")
      return
    }

    if (!settingsPin || settingsPin.trim().length < 4) {
      setError("Die Einstellungs-PIN muss mindestens 4 Zeichen lang sein.")
      return
    }

    if (settingsPin !== settingsPinConfirm) {
      setError("Die Einstellungs-PINs stimmen nicht überein.")
      return
    }

    setStep(3)
  }

  const handleChildDisplayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setChildDisplayName(val)
    if (!hasManuallyEditedChildUsername) {
      const suggested = val.toLowerCase().replace(/[^a-z0-9_\-\.]/g, "")
      setChildUsername(suggested)
    }
  }

  const handleProtectedSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError(null)

    if (createChild) {
      const cleanChildUser = childUsername.trim()

      if (!cleanChildUser || cleanChildUser.length < 2 || cleanChildUser.length > 50) {
        setError("Der Benutzername des Kindes muss zwischen 2 und 50 Zeichen lang sein.")
        return
      }

      if (!/^[a-zA-Z0-9_\-\.]+$/.test(cleanChildUser)) {
        setError("Der Benutzername des Kindes darf nur Buchstaben, Zahlen, Bindestriche und Punkte enthalten.")
        return
      }

      if (cleanChildUser.toLowerCase() === username.trim().toLowerCase()) {
        setError("Eltern-Konto und Kinder-Konto müssen unterschiedliche Benutzernamen haben.")
        return
      }

      if (cleanChildUser.toLowerCase() === "default" || cleanChildUser.toLowerCase() === "env-admin") {
        setError("Dieser Benutzername für das Kind ist reserviert.")
        return
      }

      if (childPassword.length < 8 || !/[^a-zA-Z0-9]/.test(childPassword)) {
        setError("Das Passwort für das Kind muss mindestens 8 Zeichen lang sein und mindestens ein Sonderzeichen enthalten.")
        return
      }

      if (childPassword !== childConfirmPassword) {
        setError("Die Passwörter für das Kinder-Konto stimmen nicht überein.")
        return
      }
    }

    setLoading(true)
    try {
      const res = await completeSetupProtected({
        username: username.trim(),
        password,
        settingsPin: settingsPin.trim(),
        createChild,
        childAccount: createChild
          ? {
              username: childUsername.trim(),
              displayName: childDisplayName.trim() || childUsername.trim(),
              password: childPassword,
            }
          : undefined,
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
          {step === 3 ? <UserPlus className="w-7 h-7" /> : <Sparkles className="w-7 h-7" />}
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
          {step === 3 ? "Kinder-Konto einrichten" : "Willkommen beim Vokabeltrainer! 👋"}
        </h1>
        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 mt-2 max-w-md mx-auto">
          {step === 1
            ? "Wähle bitte, wie du den Vokabeltrainer auf diesem System nutzen möchtest:"
            : step === 2
            ? "Richte dein Eltern-Konto und die Einstellungs-PIN ein (Schritt 1 von 2)."
            : "Möchtest du direkt ein Profil für dein Kind anlegen (Schritt 2 von 2)?"}
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
                  <span>Kindersicherung per PIN für Einstellungen</span>
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
                Schnellstart ohne Benutzerkonten. Einstellungen werden mit einer PIN geschützt.
              </p>

              <ul className="space-y-2.5 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>Kein Login beim Vokabellernen nötig</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>Einstellungsmenü mit PIN geschützt</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>Alle Vokabeln in einer gemeinsamen Übersicht</span>
                </li>
              </ul>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setError(null)
                setShowSingleUserModal(true)
              }}
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
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-6 uppercase tracking-wider pb-2 border-b border-zinc-100 dark:border-zinc-800">
            <span>Schritt 1 von 2: Eltern-Konto</span>
            <span>Geschützter Modus</span>
          </div>

          <form onSubmit={handleProceedToChildStep} className="space-y-6">
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
                    placeholder="Mind. 8 Zeichen & 1 Sonderzeichen"
                    required
                    minLength={8}
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
                    minLength={8}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* 2. Einstellungs-PIN */}
            <div className="space-y-4 pt-2">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 pb-1 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                2. PIN für das Einstellungsmenü
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Schützt Einstellungen, API-Keys und Profile vor unbefugten Änderungen durch Kinder.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Einstellungs-PIN *
                  </label>
                  <input
                    type="password"
                    value={settingsPin}
                    onChange={(e) => setSettingsPin(e.target.value)}
                    placeholder="z. B. 1234 (mind. 4 Zeichen)"
                    required
                    minLength={4}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    PIN bestätigen *
                  </label>
                  <input
                    type="password"
                    value={settingsPinConfirm}
                    onChange={(e) => setSettingsPinConfirm(e.target.value)}
                    placeholder="PIN wiederholen"
                    required
                    minLength={4}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setStep(1)
                  setError(null)
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Zurück
              </button>
              <button
                type="submit"
                className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Weiter: Kinder-Konto einrichten</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Screen 3: Child Account Setup Prompt */}
      {step === 3 && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 sm:p-8 border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400 mb-6 uppercase tracking-wider pb-2 border-b border-zinc-100 dark:border-zinc-800">
            <span>Schritt 2 von 2: Kinder-Konto</span>
            <span>Geschützter Modus</span>
          </div>

          <div className="mb-6">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">
              Möchtest du direkt ein Kinder-Konto einrichten?
            </h2>
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
              Mit einem Kinder-Konto kann dein Kind direkt mit eigenem Namen und Lernstand Vokabeln üben, ohne Zugriff auf deine Einstellungen.
            </p>
          </div>

          <form onSubmit={handleProtectedSubmit} className="space-y-6">
            {/* Choice: Create Child Account Now vs Later */}
            <div className="space-y-3">
              <label
                onClick={() => setCreateChild(true)}
                className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  createChild
                    ? "border-blue-500 bg-blue-50/40 dark:bg-blue-950/20"
                    : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                }`}
              >
                <input
                  type="radio"
                  name="childOption"
                  checked={createChild}
                  onChange={() => setCreateChild(true)}
                  className="mt-1 text-blue-600 focus:ring-blue-500"
                />
                <div className="w-full">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      Ja, jetzt ein Kinder-Konto anlegen
                    </span>
                    <span className="text-[11px] font-semibold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                      Empfohlen
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Richte die Zugangsdaten für dein Kind ein.
                  </p>

                  {createChild && (
                    <div className="mt-4 pt-4 border-t border-blue-200/60 dark:border-blue-900/40 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Rufname / Vorname *
                          </label>
                          <input
                            type="text"
                            value={childDisplayName}
                            onChange={handleChildDisplayNameChange}
                            placeholder="z. B. Leon oder Anna"
                            required={createChild}
                            autoFocus
                            className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Anmeldename *
                          </label>
                          <input
                            type="text"
                            value={childUsername}
                            onChange={(e) => {
                              setHasManuallyEditedChildUsername(true)
                              setChildUsername(e.target.value)
                            }}
                            placeholder="z. B. leon"
                            required={createChild}
                            className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Passwort für Kind *
                          </label>
                          <input
                            type="password"
                            value={childPassword}
                            onChange={(e) => setChildPassword(e.target.value)}
                            placeholder="Mind. 8 Zeichen & 1 Sonderzeichen"
                            required={createChild}
                            minLength={8}
                            className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Passwort bestätigen *
                          </label>
                          <input
                            type="password"
                            value={childConfirmPassword}
                            onChange={(e) => setChildConfirmPassword(e.target.value)}
                            placeholder="Passwort wiederholen"
                            required={createChild}
                            minLength={8}
                            className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </label>

              <label
                onClick={() => setCreateChild(false)}
                className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  !createChild
                    ? "border-blue-500 bg-blue-50/40 dark:bg-blue-950/20"
                    : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                }`}
              >
                <input
                  type="radio"
                  name="childOption"
                  checked={!createChild}
                  onChange={() => setCreateChild(false)}
                  className="mt-1 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    Nein, erst später in den Einstellungen anlegen
                  </span>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Du startest vorerst nur mit deinem Eltern-Konto. In den Einstellungen unter „Benutzerverwaltung“ kannst du jederzeit Kinder-Profile hinzufügen.
                  </p>
                </div>
              </label>
            </div>

            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setStep(2)
                  setError(null)
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Zurück zu Eltern-Konto
              </button>

              <button
                type="submit"
                disabled={loading}
                className="py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {loading ? "Richte Vokabeltrainer ein..." : "Einrichtung abschließen 🚀"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal for Single-User Mode Settings PIN */}
      {showSingleUserModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              Einzelnutzer-Modus einrichten
            </h3>

            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">
              Zum Vokabellernen ist kein Login nötig. Bitte lege eine <strong>PIN für das Einstellungsmenü</strong> fest, um deine Einstellungen zu schützen.
            </p>

            <form onSubmit={handleStartSingleUser} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Einstellungs-PIN *
                </label>
                <input
                  type="password"
                  value={singleUserPin}
                  onChange={(e) => setSingleUserPin(e.target.value)}
                  placeholder="z. B. 1234 (mind. 4 Zeichen)"
                  required
                  minLength={4}
                  autoFocus
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  PIN bestätigen *
                </label>
                <input
                  type="password"
                  value={singleUserPinConfirm}
                  onChange={(e) => setSingleUserPinConfirm(e.target.value)}
                  placeholder="PIN wiederholen"
                  required
                  minLength={4}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSingleUserModal(false)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {loading ? "Richte ein..." : "Einzelnutzer-Modus starten 🚀"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
