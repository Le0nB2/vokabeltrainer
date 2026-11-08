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
  Database,
  Key,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react"
import { completeSetupSingleUser, completeSetupProtected } from "@/actions/setup"
import { testAndMigrateDatabase, useLocalDatabase } from "@/actions/setup-database"
import { saveAiKeyAction } from "@/actions/ai-credentials"
import { ChildShareInfoCard } from "@/components/ChildShareInfoCard"

interface SetupWizardProps {
  isPublicOrRender: boolean
  isRender?: boolean
  initialDatabaseNeedsSetup?: boolean
}

export function SetupWizard({
  isPublicOrRender,
  isRender = false,
  initialDatabaseNeedsSetup = false,
}: SetupWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(initialDatabaseNeedsSetup ? 0 : 1)
  const [showSingleUserModal, setShowSingleUserModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 0 Database States
  const [dbType, setDbType] = useState<"postgres" | "sqlite">(
    isRender || isPublicOrRender ? "postgres" : "sqlite"
  )
  const [neonUrl, setNeonUrl] = useState("")
  const [dbLoading, setDbLoading] = useState(false)
  const [dbSuccess, setDbSuccess] = useState<string | null>(null)
  const [dbError, setDbError] = useState<string | null>(null)
  const [copiedNeonUrl, setCopiedNeonUrl] = useState(false)

  // AI Step State (in step 4 / completion)
  const [aiProviderChoice, setAiProviderChoice] = useState<"openrouter" | "gemini">("openrouter")
  const [openRouterKey, setOpenRouterKey] = useState("")
  const [geminiKey, setGeminiKey] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSuccess, setAiSuccess] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)

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

  const handleConnectNeon = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setDbError(null)
    setDbSuccess(null)

    if (dbType === "sqlite") {
      setDbLoading(true)
      const res = await useLocalDatabase()
      setDbLoading(false)
      if (res.success) {
        setStep(1)
      } else {
        setDbError(res.error || "Fehler beim Initialisieren von SQLite.")
      }
      return
    }

    if (!neonUrl.trim()) {
      setDbError("Bitte gib einen Neon Connection String ein.")
      return
    }

    setDbLoading(true)
    try {
      const res = await testAndMigrateDatabase(neonUrl.trim())
      if (res.success) {
        setDbSuccess(res.message || "Neon-Datenbank erfolgreich verbunden!")
      } else {
        setDbError(res.error || "Verbindung zur Neon-Datenbank fehlgeschlagen.")
      }
    } catch (err: any) {
      setDbError(err?.message || "Unerwarteter Fehler bei der Verbindung.")
    } finally {
      setDbLoading(false)
    }
  }

  const handleSaveAiCredentials = async () => {
    setAiError(null)
    setAiSuccess(null)
    setAiLoading(true)
    try {
      if (aiProviderChoice === "openrouter") {
        if (!openRouterKey.trim()) {
          setAiError("Bitte gib einen OpenRouter API-Key ein.")
          setAiLoading(false)
          return
        }
        const res = await saveAiKeyAction("openrouter_key", openRouterKey.trim(), true)
        if (res.success) {
          setAiSuccess("OpenRouter erfolgreich konfiguriert!")
        } else {
          setAiError(res.error || "Fehler beim Speichern des Schlüssels.")
        }
      } else {
        if (!geminiKey.trim()) {
          setAiError("Bitte gib einen Google AI Studio Key ein.")
          setAiLoading(false)
          return
        }
        const res = await saveAiKeyAction("gemini_key", geminiKey.trim(), true)
        if (res.success) {
          setAiSuccess("Google Gemini Key erfolgreich gespeichert!")
        } else {
          setAiError(res.error || "Fehler beim Speichern des Schlüssels.")
        }
      }
    } catch (err: any) {
      setAiError(err?.message || "Fehler beim Speichern.")
    } finally {
      setAiLoading(false)
    }
  }

  const handleStartSingleUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError(null)

    const cleanPin = singleUserPin.trim()
    if (cleanPin.length > 0) {
      if (cleanPin.length < 4) {
        setError("Die Einstellungs-PIN muss mindestens 4 Zeichen lang sein.")
        return
      }
      if (cleanPin.length > 128) {
        setError("Die Einstellungs-PIN darf maximal 128 Zeichen lang sein.")
        return
      }
      if (cleanPin !== singleUserPinConfirm.trim()) {
        setError("Die Einstellungs-PINs stimmen nicht überein.")
        return
      }
    }

    setLoading(true)
    try {
      const res = await completeSetupSingleUser({
        settingsPin: cleanPin || undefined,
      })
      if (res.success) {
        router.push("/")
        router.refresh()
        if (typeof window !== "undefined") {
          window.location.href = "/"
        }
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
      setError("Der Benutzername darf nur Buchstaben, Zahlen, Punkte, Binde- und Unterstriche enthalten.")
      return
    }

    if (!password || password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen lang sein.")
      return
    }

    if (password !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein.")
      return
    }

    const cleanPin = settingsPin.trim()
    if (!cleanPin || cleanPin.length < 4) {
      setError("Die Einstellungs-PIN muss mindestens 4 Zeichen lang sein.")
      return
    }

    if (cleanPin !== settingsPinConfirm.trim()) {
      setError("Die Einstellungs-PINs stimmen nicht überein.")
      return
    }

    setStep(3)
  }

  const handleChildDisplayNameChange = (val: string) => {
    setChildDisplayName(val)
    if (!hasManuallyEditedChildUsername) {
      const slug = val
        .toLowerCase()
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/ß/g, "ss")
        .replace(/[^a-z0-9_\-]/g, "")
      setChildUsername(slug)
    }
  }

  const handleChildUsernameChange = (val: string) => {
    setHasManuallyEditedChildUsername(true)
    setChildUsername(val)
  }

  const handleCompleteProtected = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError(null)

    let childData: { username: string; displayName?: string; password: string } | undefined

    if (createChild) {
      const cleanChildUser = childUsername.trim()
      if (!cleanChildUser || cleanChildUser.length < 2 || cleanChildUser.length > 50) {
        setError("Der Kinder-Benutzername muss zwischen 2 und 50 Zeichen lang sein.")
        return
      }

      if (!/^[a-zA-Z0-9_\-\.]+$/.test(cleanChildUser)) {
        setError("Der Kinder-Benutzername darf nur Buchstaben, Zahlen, Punkte, Binde- und Unterstriche enthalten.")
        return
      }

      if (cleanChildUser.toLowerCase() === username.trim().toLowerCase()) {
        setError("Der Kinder-Benutzername muss sich vom Eltern-Benutzernamen unterscheiden.")
        return
      }

      if (!childPassword || childPassword.length < 8) {
        setError("Das Kinder-Passwort muss mindestens 8 Zeichen lang sein.")
        return
      }

      if (childPassword !== childConfirmPassword) {
        setError("Die Passwörter für das Kinder-Konto stimmen nicht überein.")
        return
      }

      childData = {
        username: cleanChildUser,
        displayName: childDisplayName.trim() || undefined,
        password: childPassword,
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
        setLoading(false)
        setStep(4)
      } else {
        setError(res.error || "Fehler beim Einrichten.")
        setLoading(false)
      }
    } catch {
      setError("Ein unerwarteter Fehler ist aufgetreten.")
      setLoading(false)
    }
  }

  const handleFinalRedirect = () => {
    router.push("/")
    router.refresh()
    if (typeof window !== "undefined") {
      window.location.href = "/"
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Top Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 mb-3 shadow-sm">
          {step === 4 ? (
            <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
          ) : step === 3 ? (
            <UserPlus className="w-7 h-7" />
          ) : step === 0 ? (
            <Database className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          ) : (
            <Sparkles className="w-7 h-7" />
          )}
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
          {step === 4
            ? "Einrichtung fast abgeschlossen! 🎉"
            : step === 3
            ? "Kinder-Konto einrichten"
            : step === 0
            ? "Datenbank auswählen & verbinden"
            : "Willkommen beim N30 Vokabeltrainer! 👋"}
        </h1>
        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 mt-2 max-w-md mx-auto">
          {step === 0
            ? "Wähle aus, wo deine Vokabeln, Decks und Lernfortschritte gespeichert werden sollen."
            : step === 1
            ? "Wähle bitte, wie du den N30 Vokabeltrainer auf diesem System nutzen möchtest:"
            : step === 2
            ? "Richte dein Eltern-Konto und die Einstellungs-PIN ein (Schritt 1 von 2)."
            : step === 3
            ? "Möchtest du direkt ein Profil für dein Kind anlegen (Schritt 2 von 2)?"
            : "Hier kannst du die KI-Funktionen konfigurieren oder direkt loslegen:"}
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl text-sm text-rose-700 dark:text-rose-300 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Screen 0: Database Configuration (Neon PostgreSQL vs SQLite) */}
      {step === 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl">
          {(isRender || isPublicOrRender) && (
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-2xl flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="text-xs sm:text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                <strong>Render-Cloud erkannt:</strong> Da Render im kostenlosen Free-Plan flüchtigen Speicher nutzt, wähle bitte die kostenlose <strong>Neon PostgreSQL Cloud-Datenbank</strong>, damit deine Vokabeln dauerhaft gespeichert bleiben.
              </div>
            </div>
          )}

          <div className="space-y-4 mb-6">
            {/* Neon Option */}
            <div
              onClick={() => setDbType("postgres")}
              className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                dbType === "postgres"
                  ? "border-blue-600 bg-blue-50/30 dark:bg-blue-950/20"
                  : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
              }`}
            >
              <div className="flex items-start gap-3.5">
                <input
                  type="radio"
                  name="dbType"
                  checked={dbType === "postgres"}
                  onChange={() => setDbType("postgres")}
                  className="mt-1 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
                      Neon Cloud-Datenbank (PostgreSQL)
                    </span>
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                      Empfohlen für Render
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                    Dauerhaft kostenlos, serverless und ideal für den Betrieb auf Render und in der Cloud.
                  </p>

                  {dbType === "postgres" && (
                    <div className="mt-4 space-y-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Neon Connection String *
                      </label>
                      <input
                        type="password"
                        value={neonUrl}
                        onChange={(e) => setNeonUrl(e.target.value)}
                        placeholder="postgresql://user:password@endpoint.neon.tech/neondb?sslmode=require"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex items-center justify-between text-xs">
                        <a
                          href="https://neon.tech"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline flex items-center gap-1 font-medium"
                        >
                          Kostenlose Datenbank auf neon.tech erstellen <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SQLite Option */}
            <div
              onClick={() => setDbType("sqlite")}
              className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                dbType === "sqlite"
                  ? "border-blue-600 bg-blue-50/30 dark:bg-blue-950/20"
                  : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
              }`}
            >
              <div className="flex items-start gap-3.5">
                <input
                  type="radio"
                  name="dbType"
                  checked={dbType === "sqlite"}
                  onChange={() => setDbType("sqlite")}
                  className="mt-1 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="font-bold text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
                    Lokale Datei-Datenbank (SQLite)
                  </span>
                  <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                    Keine Cloud nötig. Perfekt für lokale Docker-Installationen zu Hause (Synology NAS, Unraid, Heimserver mit gemountetem Volume).
                  </p>
                  {(isRender || isPublicOrRender) && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">
                      ⚠️ Hinweis: Auf Render Free gehen Daten im SQLite-Modus bei Server-Pausen verloren!
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {dbError && (
            <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{dbError}</span>
            </div>
          )}

          {dbSuccess && (
            <div className="mb-4 space-y-3">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs sm:text-sm text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="font-semibold">{dbSuccess}</span>
              </div>
              {(isRender || isPublicOrRender) && (
                <div className="p-3.5 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-xs text-zinc-700 dark:text-zinc-300">
                  <p className="font-bold mb-1">💡 Wichtiger Tipp für Render Free:</p>
                  <p className="text-zinc-500 dark:text-zinc-400 mb-2">
                    Trage diesen Connection String einmalig in deinem Render Dashboard unter &bdquo;Environment&ldquo; als <code className="bg-zinc-200 dark:bg-zinc-700 px-1 py-0.5 rounded">DATABASE_URL</code> ein:
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(neonUrl)
                      setCopiedNeonUrl(true)
                      setTimeout(() => setCopiedNeonUrl(false), 2000)
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
                  >
                    {copiedNeonUrl ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedNeonUrl ? "Kopiert!" : "Connection String kopieren"}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
            {dbSuccess ? (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-xs sm:text-sm transition-colors flex items-center gap-2 shadow-sm"
              >
                Weiter zur Benutzereinrichtung <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={dbLoading}
                onClick={handleConnectNeon}
                className="py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-xs sm:text-sm transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {dbLoading ? "Prüfe & migriere..." : dbType === "sqlite" ? "SQLite aktivieren & Weiter" : "Verbindung prüfen & initialisieren ⚡"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Screen 1: Mode Selection */}
      {step === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Option A: Protected Mode */}
          <div className="bg-white dark:bg-zinc-900 border-2 border-blue-500/30 hover:border-blue-500 dark:border-blue-500/20 dark:hover:border-blue-500/60 rounded-3xl p-6 sm:p-7 shadow-lg flex flex-col justify-between transition-all">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4">
                <Users className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  Geschützter Modus
                </h3>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                  Empfohlen
                </span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
                Ideal für Familien & geteilte Geräte. Schützt Einstellungen und API-Keys mit einer Eltern-PIN und trennt Lernstände sauber voneinander.
              </p>
              <ul className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 space-y-2 mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Kindersichere PIN für sensible Einstellungen</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Getrennte Vokabelstapel & Statistiken</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Einfacher Kinder-Login ohne E-Mail-Adresse</span>
                </li>
              </ul>
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              Geschützt einrichten <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Option B: Single-User Mode */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-3xl p-6 sm:p-7 shadow-sm flex flex-col justify-between transition-all">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 flex items-center justify-center mb-4">
                <User className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                Einzelnutzer-Modus
              </h3>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
                Schnellstart ohne Benutzerkonten. Alle Daten werden zentral für einen einzelnen Nutzer gespeichert.
              </p>
              <ul className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 space-y-2 mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Sofort startklar ohne Passwörter</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Optional mit Einstellungs-PIN absicherbar</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Jederzeit später auf Benutzerkonten erweiterbar</span>
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

      {/* Screen 2: Parent Admin Credentials & PIN */}
      {step === 2 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl">
          <div className="mb-6 flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-xs sm:text-sm font-semibold text-blue-600 dark:text-blue-400">
              Schritt 1 von 2: Eltern-Konto
            </span>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Modus wechseln
            </button>
          </div>

          <form onSubmit={handleProceedToChildStep} className="space-y-6">
            <div className="space-y-4">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 pb-1 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                1. Eltern- / Administrator-Konto
              </h2>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Eltern-Benutzername *
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="z. B. Papa, Mama oder Admin"
                  required
                  minLength={2}
                  maxLength={50}
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
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Zurück
              </button>

              <button
                type="submit"
                className="py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                Weiter: Kinder-Konto einrichten <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Screen 3: Child Account */}
      {step === 3 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl">
          <div className="mb-6 flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-xs sm:text-sm font-semibold text-blue-600 dark:text-blue-400">
              Schritt 2 von 2: Kinder-Konto
            </span>
            <button
              type="button"
              onClick={() => {
                setStep(2)
                setError(null)
              }}
              className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Zurück zu Eltern-Konto
            </button>
          </div>

          <form onSubmit={handleCompleteProtected} className="space-y-6">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Möchtest du direkt ein Kinder-Konto einrichten?
            </h3>

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
                <div className="flex-1">
                  <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    Ja, jetzt ein Kinder-Konto anlegen
                  </span>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Dein Kind erhält einen kindgerechten Benutzernamen und ein eigenes Passwort.
                  </p>

                  {createChild && (
                    <div className="mt-4 space-y-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                          Name des Kindes *
                        </label>
                        <input
                          type="text"
                          value={childDisplayName}
                          onChange={(e) => handleChildDisplayNameChange(e.target.value)}
                          placeholder="z. B. Leon oder Anna"
                          required={createChild}
                          autoFocus
                          className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                          Benutzername für die Anmeldung *
                        </label>
                        <input
                          type="text"
                          value={childUsername}
                          onChange={(e) => handleChildUsernameChange(e.target.value)}
                          placeholder="z. B. leon"
                          required={createChild}
                          minLength={2}
                          maxLength={50}
                          className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Kinder-Passwort *
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
                {loading ? "Richte N30 Vokabeltrainer ein..." : "Einrichtung abschließen 🚀"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Screen 4: Child Account Sharing & Optional AI Setup */}
      {step === 4 && (
        <div className="space-y-6">
          {createChild && (
            <ChildShareInfoCard
              childName={childDisplayName || childUsername}
              childUsername={childUsername.trim()}
              onFinish={handleFinalRedirect}
            />
          )}

          {/* Optional AI Connection Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl text-left">
            <div className="flex items-center gap-2.5 mb-2">
              <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">
                KI-Funktionen einrichten (Optional)
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mb-5 leading-relaxed">
              Für das automatische Einlesen von Vokabelheften per Foto, didaktische Eselsbrücken und Lückentexte.
            </p>

            <div className="space-y-4 mb-5">
              {/* Option 1: OpenRouter */}
              <div
                onClick={() => setAiProviderChoice("openrouter")}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  aiProviderChoice === "openrouter"
                    ? "border-purple-600 bg-purple-50/30 dark:bg-purple-950/20"
                    : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="aiChoice"
                    checked={aiProviderChoice === "openrouter"}
                    onChange={() => setAiProviderChoice("openrouter")}
                    className="mt-1 text-purple-600 focus:ring-purple-500"
                  />
                  <div className="flex-1">
                    <span className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100">
                      🟣 Option 1: OpenRouter (1-Klick verbinden oder Key)
                    </span>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Universeller Zugriff auf alle Modelle (GPT-4o, Claude, Gemini) und kostenlose Free-Modelle.
                    </p>

                    {aiProviderChoice === "openrouter" && (
                      <div className="mt-3 space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                        <a
                          href="/api/auth/openrouter/login?returnTo=/setup"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-medium transition-colors shadow-sm"
                        >
                          <Sparkles className="w-3.5 h-3.5" /> Mit OpenRouter verbinden (1-Klick)
                        </a>
                        <p className="text-xs text-zinc-500">oder API-Schlüssel manuell eingeben:</p>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={openRouterKey}
                            onChange={(e) => setOpenRouterKey(e.target.value)}
                            placeholder="sk-or-v1-..."
                            className="flex-1 px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
                          />
                          <button
                            type="button"
                            disabled={aiLoading}
                            onClick={handleSaveAiCredentials}
                            className="px-3 py-2 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-xl text-xs font-medium disabled:opacity-50"
                          >
                            Speichern
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Option 2: Google Gemini */}
              <div
                onClick={() => setAiProviderChoice("gemini")}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  aiProviderChoice === "gemini"
                    ? "border-blue-600 bg-blue-50/30 dark:bg-blue-950/20"
                    : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="aiChoice"
                    checked={aiProviderChoice === "gemini"}
                    onChange={() => setAiProviderChoice("gemini")}
                    className="mt-1 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <span className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100">
                      🔵 Option 2: Google Gemini (Free-Tier API-Key)
                    </span>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Kostenloser Schlüssel aus dem Google AI Studio (15 Requests/Min kostenlos).
                    </p>

                    {aiProviderChoice === "gemini" && (
                      <div className="mt-3 space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={geminiKey}
                            onChange={(e) => setGeminiKey(e.target.value)}
                            placeholder="AIzaSy..."
                            className="flex-1 px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
                          />
                          <button
                            type="button"
                            disabled={aiLoading}
                            onClick={handleSaveAiCredentials}
                            className="px-3 py-2 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-xl text-xs font-medium disabled:opacity-50"
                          >
                            Speichern
                          </button>
                        </div>
                        <a
                          href="https://aistudio.google.com/app/apikey"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 font-medium"
                        >
                          Kostenlosen Key im Google AI Studio holen <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {aiSuccess && <p className="text-xs text-emerald-600 mb-4 font-semibold">✅ {aiSuccess}</p>}
            {aiError && <p className="text-xs text-rose-600 mb-4 font-medium">⚠️ {aiError}</p>}

            {!createChild && (
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
                <button
                  type="button"
                  onClick={handleFinalRedirect}
                  className="py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-xs sm:text-sm transition-colors flex items-center gap-2 shadow-sm"
                >
                  Einrichtung abschließen & zur App 🚀
                </button>
              </div>
            )}
          </div>
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
              Möchtest du eine PIN für den Schutz des Einstellungsmenüs vergeben?
            </p>

            <form onSubmit={handleStartSingleUser} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Einstellungs-PIN (optional)
                </label>
                <input
                  type="password"
                  value={singleUserPin}
                  onChange={(e) => setSingleUserPin(e.target.value)}
                  placeholder="z. B. 1234 (mind. 4 Zeichen)"
                  minLength={4}
                  autoFocus
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  PIN bestätigen {singleUserPin.trim().length > 0 ? "*" : "(optional)"}
                </label>
                <input
                  type="password"
                  value={singleUserPinConfirm}
                  onChange={(e) => setSingleUserPinConfirm(e.target.value)}
                  placeholder="PIN wiederholen"
                  required={singleUserPin.trim().length > 0}
                  minLength={singleUserPin.trim().length > 0 ? 4 : undefined}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {singleUserPin.trim().length > 0
                  ? "🔒 Dein Einstellungsmenü wird durch diese PIN geschützt."
                  : "🔓 Ohne PIN wird kein Kennwort vergeben (jederzeit in den Einstellungen änderbar)."}
              </p>

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
