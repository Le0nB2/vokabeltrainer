"use client"

import { useState, useEffect } from "react"
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
  ChevronDown,
} from "lucide-react"
import { completeSetupSingleUser, completeSetupProtected } from "@/actions/setup"
import { testAndMigrateDatabase, useLocalDatabase } from "@/actions/setup-database"
import { saveAiKeyAction, getAiConfigStatus } from "@/actions/ai-credentials"
import { ChildShareInfoCard } from "@/components/ChildShareInfoCard"
import { AppLogoIcon } from "@/components/AppLogo"

type Step = "welcome" | 0 | 1 | 2 | 3 | 4 | 5

interface SetupWizardProps {
  isPublicOrRender: boolean
  isRender?: boolean
  initialDatabaseNeedsSetup?: boolean
  initialStep?: Step
  initialShowAdvanced?: boolean
}

export function SetupWizard({
  isPublicOrRender,
  isRender = false,
  initialDatabaseNeedsSetup = false,
  initialStep,
  initialShowAdvanced = false,
}: SetupWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(
    initialStep ?? (initialDatabaseNeedsSetup ? "welcome" : 1)
  )
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
  const [showAdvancedDb, setShowAdvancedDb] = useState(false)
  const [showAdvancedMode, setShowAdvancedMode] = useState(initialShowAdvanced)

  // AI Step State (Step 4)
  const [aiProviderChoice, setAiProviderChoice] = useState<"openrouter" | "openai" | "gemini">("openrouter")
  const [openRouterKey, setOpenRouterKey] = useState("")
  const [openAiKey, setOpenAiKey] = useState("")
  const [geminiKey, setGeminiKey] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSuccess, setAiSuccess] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [isAiConfigured, setIsAiConfigured] = useState(false)
  const [isSingleUserMode, setIsSingleUserMode] = useState(false)

  // Single-User Mode PIN States
  const [singleUserPin, setSingleUserPin] = useState("")
  const [singleUserPinConfirm, setSingleUserPinConfirm] = useState("")

  useEffect(() => {
    // Check if any AI key or env var is configured
    getAiConfigStatus()
      .then((status) => {
        const hasKey = Boolean(
          status.hasGeminiKey ||
            status.hasOpenRouterKey ||
            status.hasOpenAiKey ||
            status.hasEnvGeminiKey ||
            status.hasEnvOpenRouterKey ||
            status.hasEnvOpenAiKey
        )
        if (hasKey) {
          setIsAiConfigured(true)
        }
        if (status.activeProvider) {
          setAiProviderChoice(status.activeProvider)
        }
      })
      .catch(() => {})

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const connected = params.get("ai_connected")
      const err = params.get("ai_error")
      if (connected === "openrouter") {
        setStep(4)
        setIsAiConfigured(true)
        setAiSuccess("OpenRouter erfolgreich verknüpft! Klicke auf 'Weiter', um fortzufahren.")
        const url = new URL(window.location.href)
        url.searchParams.delete("ai_connected")
        window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ""))
      } else if (err) {
        setStep(4)
        setAiError(decodeURIComponent(err))
        const url = new URL(window.location.href)
        url.searchParams.delete("ai_error")
        window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ""))
      }
    }
  }, [])

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
          setIsAiConfigured(true)
        } else {
          setAiError(res.error || "Fehler beim Speichern des Schlüssels.")
        }
      } else if (aiProviderChoice === "openai") {
        if (!openAiKey.trim()) {
          setAiError("Bitte gib einen OpenAI (ChatGPT) API-Key ein.")
          setAiLoading(false)
          return
        }
        const res = await saveAiKeyAction("openai_key", openAiKey.trim(), true)
        if (res.success) {
          setAiSuccess("OpenAI (ChatGPT) API-Key erfolgreich gespeichert!")
          setIsAiConfigured(true)
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
          setIsAiConfigured(true)
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
        setIsSingleUserMode(true)
        setShowSingleUserModal(false)
        setLoading(false)
        // AI is mandatory! Navigate to Step 4 so user sets up AI provider
        setStep(4)
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
          {step === "welcome" ? (
            <AppLogoIcon className="w-8 h-8 text-blue-600 dark:text-blue-500" />
          ) : step === 5 ? (
            <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
          ) : step === 4 ? (
            <Sparkles className="w-7 h-7 text-purple-600 dark:text-purple-400" />
          ) : step === 3 ? (
            <UserPlus className="w-7 h-7" />
          ) : step === 0 ? (
            <Database className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          ) : (
            <Users className="w-7 h-7" />
          )}
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
          {step === "welcome" ? (
            <span className="inline-flex items-center justify-center flex-wrap gap-x-2">
              <span>Willkommen beim</span>
              <span className="inline-flex items-center tracking-tight font-extrabold">
                <span className="text-slate-900 dark:text-slate-100">N30</span>
                <span className="text-blue-600 dark:text-blue-500">Vokabeltrainer</span>
                <span>!</span>
              </span>
              <span>👋</span>
            </span>
          ) : step === 5 ? (
            "Einrichtung abgeschlossen! 🎉"
          ) : step === 4 ? (
            "KI-Assistent einrichten"
          ) : step === 3 ? (
            "Kinder-Konto einrichten"
          ) : step === 0 ? (
            "Datenbank auswählen & verbinden"
          ) : (
            "Nutzungsmodus wählen"
          )}
        </h1>
        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 mt-2 max-w-md mx-auto">
          {step === "welcome"
            ? "Lass uns deinen Vokabeltrainer in wenigen Minuten gemeinsam startklar machen."
            : step === 0
            ? "Wähle aus, wo deine Vokabeln, Decks und Lernfortschritte gespeichert werden sollen."
            : step === 1
            ? "Wähle bitte, wie du den N30 Vokabeltrainer auf diesem System nutzen möchtest:"
            : step === 2
            ? "Richte dein Eltern-Konto und die Einstellungs-PIN ein (Schritt 1 von 2)."
            : step === 3
            ? "Möchtest du direkt ein Profil für dein Kind anlegen (Schritt 2 von 2)?"
            : step === 4
            ? "Verbinde einen KI-Provider für Scan per Foto, Beispielsätze und PDF-Arbeitsblätter."
            : createChild
            ? "Hier sind die Zugangsdaten für dein Kind zum Teilen oder Ausdrucken:"
            : "Dein Vokabeltrainer ist nun startklar eingerichtet!"}
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl text-sm text-rose-700 dark:text-rose-300 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Screen 'welcome': Ersteinrichtungs-Willkommensseite */}
      {step === "welcome" && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl">
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight mb-2">
              Lass uns loslegen! 🚀
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Bevor es mit dem spielerischen Vokabellernen losgeht, konfigurieren wir gemeinsam kurz die wichtigsten Grundlagen für Speicherung, Sicherheit und KI-Funktionen:
            </p>
          </div>

          <div className="space-y-3.5 mb-8">
            {/* Schritt 1: Datenbank */}
            <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                <Database className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                    Schritt 1
                  </span>
                  <h3 className="font-bold text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
                    Datenbank verbinden
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Sichere und dauerhafte Speicherung all deiner Vokabeln, Decks und individuellen Lernfortschritte &ndash; kostenlos in der Cloud (Neon PostgreSQL) oder lokal.
                </p>
              </div>
            </div>

            {/* Schritt 2: Konten & Schutz */}
            <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                    Schritt 2
                  </span>
                  <h3 className="font-bold text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
                    Benutzerkonten &amp; Kindersicherung
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Erstelle getrennte Profile für Eltern und Kinder. Eine Eltern-PIN schützt sensible Einstellungen und den Zugriff auf KI-Schlüssel zuverlässig ab.
                </p>
              </div>
            </div>

            {/* Schritt 3: KI-Assistent */}
            <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                    Schritt 3
                  </span>
                  <h3 className="font-bold text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
                    KI-Assistent anbinden
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Verbinde OpenRouter (ChatGPT, Claude) oder Google Gemini, um Vokabelhefte automatisch per Foto einzuscannen, didaktische Beispielsätze &amp; Eselsbrücken zu erzeugen und individuelle PDF-Arbeitsblätter zu erstellen.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-5 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              <span>Dauer: ca. 2–3 Minuten • Alle Angaben später anpassbar</span>
            </div>

            <button
              type="button"
              onClick={() => setStep(initialDatabaseNeedsSetup ? 0 : 1)}
              className="w-full sm:w-auto py-3 px-6 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-xl font-semibold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
            >
              <span>Einrichtung jetzt starten</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Screen 0: Database Configuration (Neon PostgreSQL vs SQLite) */}
      {step === 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl">
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
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
                      Erforderlich
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

            {/* SQLite Option - Collapsible when running on Render */}
            {isRender ? (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdvancedDb(!showAdvancedDb)}
                  className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors font-medium py-1.5"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showAdvancedDb ? "rotate-180" : ""}`} />
                  Erweiterte Einstellungen
                </button>

                {showAdvancedDb && (
                  <div className="mt-3">
                    <div
                      onClick={() => setDbType("sqlite")}
                      className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                        dbType === "sqlite"
                          ? "border-blue-600 bg-blue-50/30 dark:bg-blue-950/20"
                          : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="dbType"
                          checked={dbType === "sqlite"}
                          onChange={() => setDbType("sqlite")}
                          className="mt-1 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <span className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100">
                            Lokale Datei-Datenbank (SQLite)
                          </span>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            Keine Cloud nötig. Für lokale Docker-Installationen zu Hause (NAS, Unraid, lokaler PC).
                          </p>
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">
                            ⚠️ Hinweis: Auf Render Free gehen Daten im SQLite-Modus bei Server-Pausen verloren!
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
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
                  </div>
                </div>
              </div>
            )}
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

          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep("welcome")}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Zurück zur Einführung
            </button>
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
        <div>
          {!isRender ? (
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
                  type="button"
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
          ) : (
            /* Render Cloud Mode: Geschützter Modus prominently displayed as "Erforderlich", Einzelnutzer hidden under "Erweiterte Einstellungen" */
            <div className="space-y-4">
              <div className="bg-white dark:bg-zinc-900 border-2 border-blue-600 dark:border-blue-500 rounded-3xl p-6 sm:p-8 shadow-xl">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Users className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                        Geschützter Modus
                      </h3>
                      <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                        Erforderlich
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      Für Render und Cloud-Betrieb: Schützt Einstellungen, API-Keys und Datenbankverbindung zuverlässig mit einer Eltern-PIN und trennt Profile für Eltern und Kinder.
                    </p>
                  </div>
                </div>

                <ul className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 space-y-2.5 my-6 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Kindersichere PIN für sensible Einstellungen &amp; API-Keys</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Getrennte Vokabelstapel, Lernstände &amp; Statistiken</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Einfacher Kinder-Login ohne E-Mail-Adresse</span>
                  </li>
                </ul>

                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full py-3.5 px-6 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white rounded-xl font-semibold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                >
                  <span>Geschützt einrichten</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Collapsed Option B under "Erweiterte Einstellungen" */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdvancedMode(!showAdvancedMode)}
                  className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors font-medium px-2 py-1"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      showAdvancedMode ? "rotate-180" : ""
                    }`}
                  />
                  Erweiterte Einstellungen
                </button>

                {showAdvancedMode && (
                  <div className="mt-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm transition-all">
                    <div className="flex items-start gap-3.5 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 flex items-center justify-center shrink-0">
                        <User className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1">
                          Einzelnutzer-Modus
                        </h3>
                        <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          Schnellstart ohne Benutzerkonten. Alle Daten werden zentral für einen einzelnen Nutzer gespeichert.
                        </p>
                      </div>
                    </div>

                    <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2 mb-4">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                      <span>
                        Hinweis: Im Cloud-Betrieb auf Render wird der geschützte Modus dringend empfohlen, damit Einstellungen und API-Keys durch eine Eltern-PIN geschützt bleiben.
                      </span>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          setError(null)
                          setShowSingleUserModal(true)
                        }}
                        className="py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl font-medium text-xs sm:text-sm transition-colors"
                      >
                        Trotzdem als Einzelnutzer starten
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {initialDatabaseNeedsSetup && (
            <div className="mt-6 flex justify-start">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Zurück zur Datenbankauswahl
              </button>
            </div>
          )}
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

      {/* Screen 4: Dedicated AI Provider Setup (Mandatory) */}
      {step === 4 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl text-left space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">
                KI-Assistent verbinden
              </h3>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              Erforderlich
            </span>
          </div>

          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Die KI ist ein zentraler Bestandteil des N30 Vokabeltrainers: Sie ermöglicht das Einlesen von Vokabellisten und Schulbuchseiten per Foto, generiert didaktische Eselsbrücken, Beispielsätze und erstellt druckbare PDF-Arbeitsblätter mit Lückentexten.
          </p>

          {isAiConfigured && (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-center gap-2.5 text-xs sm:text-sm text-emerald-800 dark:text-emerald-300 font-medium">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>KI-Assistent ist einsatzbereit! Du kannst jetzt fortfahren oder einen anderen Anbieter wählen.</span>
            </div>
          )}

          <div className="space-y-4">
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
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100">
                      🟣 Option 1: OpenRouter (Empfohlen)
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                      Empfohlen
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    1-Klick-Verbindung oder API-Key. Universeller Zugriff auf GPT-4o, Claude und kostenlose Modelle.
                  </p>

                  {aiProviderChoice === "openrouter" && (
                    <div className="mt-3 space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                      <a
                        href="/api/auth/openrouter/login?returnTo=/setup?step=4"
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
                          className="flex-1 px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <button
                          type="button"
                          disabled={aiLoading}
                          onClick={handleSaveAiCredentials}
                          className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-medium disabled:opacity-50"
                        >
                          {aiLoading ? "Speichert..." : "Speichern"}
                        </button>
                      </div>
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-purple-600 dark:text-purple-400 hover:underline inline-flex items-center gap-1 font-medium"
                      >
                        API-Key auf openrouter.ai erstellen <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Option 2: ChatGPT (OpenAI) */}
            <div
              onClick={() => setAiProviderChoice("openai")}
              className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                aiProviderChoice === "openai"
                  ? "border-emerald-600 bg-emerald-50/30 dark:bg-emerald-950/20"
                  : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="aiChoice"
                  checked={aiProviderChoice === "openai"}
                  onChange={() => setAiProviderChoice("openai")}
                  className="mt-1 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="flex-1">
                  <span className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100">
                    🟢 Option 2: ChatGPT (OpenAI API-Key)
                  </span>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Direkte OpenAI API für GPT-4o, GPT-4o-mini und präzise optische Texterkennung (OCR).
                  </p>

                  {aiProviderChoice === "openai" && (
                    <div className="mt-3 space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={openAiKey}
                          onChange={(e) => setOpenAiKey(e.target.value)}
                          placeholder="sk-proj-..."
                          className="flex-1 px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          type="button"
                          disabled={aiLoading}
                          onClick={handleSaveAiCredentials}
                          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-medium disabled:opacity-50"
                        >
                          {aiLoading ? "Speichert..." : "Speichern"}
                        </button>
                      </div>
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 font-medium"
                      >
                        API-Key auf platform.openai.com erstellen <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Option 3: Google Gemini */}
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
                    🔵 Option 3: Google Gemini (Free-Tier API-Key)
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
                          className="flex-1 px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          disabled={aiLoading}
                          onClick={handleSaveAiCredentials}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium disabled:opacity-50"
                        >
                          {aiLoading ? "Speichert..." : "Speichern"}
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

          {aiSuccess && <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">✅ {aiSuccess}</p>}
          {aiError && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">⚠️ {aiError}</p>}

          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                if (isSingleUserMode) {
                  setStep(1)
                } else {
                  setStep(3)
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> {isSingleUserMode ? "Zurück zur Moduswahl" : "Zurück zu Kinder-Konto"}
            </button>

            {isSingleUserMode || !createChild ? (
              <button
                type="button"
                disabled={!isAiConfigured}
                onClick={handleFinalRedirect}
                className="py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-xs sm:text-sm transition-colors flex items-center gap-2 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                title={!isAiConfigured ? "Bitte verbinde zuerst einen KI-Provider" : undefined}
              >
                Einrichtung abschließen & zur App 🚀
              </button>
            ) : (
              <button
                type="button"
                disabled={!isAiConfigured}
                onClick={() => setStep(5)}
                className="py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-xs sm:text-sm transition-colors flex items-center gap-2 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                title={!isAiConfigured ? "Bitte verbinde zuerst einen KI-Provider" : undefined}
              >
                Weiter zum Abschluss ➔
              </button>
            )}
          </div>
        </div>
      )}

      {/* Screen 5: Final Completion & Child Credentials Sharing */}
      {step === 5 && (
        <div className="space-y-6">
          <ChildShareInfoCard
            childName={childDisplayName || childUsername}
            childUsername={childUsername.trim()}
            onFinish={handleFinalRedirect}
          />
          <div className="flex justify-start">
            <button
              type="button"
              onClick={() => setStep(4)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Zurück zur KI-Einrichtung
            </button>
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
