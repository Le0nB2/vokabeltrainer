"use client"

import { useState, useEffect } from "react"
import {
  Share2,
  Copy,
  Check,
  Smartphone,
  ExternalLink,
  Sparkles,
  ArrowRight,
  User,
  Key,
  Globe,
} from "lucide-react"

interface ChildShareInfoCardProps {
  childName: string
  childUsername: string
  onFinish: () => void
}

export function ChildShareInfoCard({
  childName,
  childUsername,
  onFinish,
}: ChildShareInfoCardProps) {
  const [appUrl, setAppUrl] = useState("")
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [shareSuccess, setShareSuccess] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAppUrl(window.location.origin)
    }
  }, [])

  const generateShareText = () => {
    const name = childName.trim() || childUsername
    return [
      `Hallo ${name}! 👋`,
      `Hier sind deine Zugangsdaten für deinen Vokabeltrainer:`,
      ``,
      `🌐 Adresse: ${appUrl}`,
      `👤 Benutzername: ${childUsername}`,
      `🔑 Passwort: (Wie mit deinen Eltern vereinbart)`,
      ``,
      `📱 So legst du den Vokabeltrainer als App auf deinem Smartphone/Tablet ab:`,
      `• iPhone/iPad (Safari): Tippe unten auf das Teilen-Symbol (Viereck mit Pfeil nach oben) und wähle „Zum Home-Bildschirm“.`,
      `• Android (Chrome): Tippe oben rechts auf das Menü (⋮) und wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.`,
      ``,
      `Viel Spaß beim Vokabellernen! 🚀`,
    ].join("\n")
  }

  const copyToClipboard = async (text: string, fieldId: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text)
        setCopiedField(fieldId)
        setTimeout(() => setCopiedField(null), 3000)
      }
    } catch {
      // Fallback for older browsers
    }
  }

  const handleShare = async () => {
    const shareText = generateShareText()
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `Vokabeltrainer für ${childName.trim() || childUsername}`,
          text: shareText,
          url: appUrl,
        })
        setShareSuccess(true)
        setTimeout(() => setShareSuccess(false), 4000)
        return
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === "AbortError") {
          return
        }
      }
    }

    // Fallback: copy to clipboard
    await copyToClipboard(shareText, "all")
    setShareSuccess(true)
    setTimeout(() => setShareSuccess(false), 4000)
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 sm:p-8 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mb-3 shadow-sm">
          <Sparkles className="w-6 h-6" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Fast geschafft! So legt {childName.trim() || childUsername} los 🎉
        </h2>
        <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-lg mx-auto">
          Das Kinder-Profil ist eingerichtet. Teile die folgenden Informationen mit deinem Kind, damit es sich direkt anmelden und loslegen kann.
        </p>
      </div>

      {shareSuccess && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Informationen erfolgreich geteilt bzw. in die Zwischenablage kopiert!</span>
        </div>
      )}

      {/* Credentials Card */}
      <div className="bg-zinc-50 dark:bg-zinc-800/40 rounded-xl p-4 sm:p-5 border border-zinc-200 dark:border-zinc-700/60 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Zugangsdaten für dein Kind
        </h3>

        {/* URL */}
        <div className="flex items-center justify-between gap-3 bg-white dark:bg-zinc-800 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center gap-2.5 min-w-0">
            <Globe className="w-4 h-4 text-blue-500 shrink-0" />
            <div className="min-w-0">
              <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">Web-Adresse (URL)</span>
              <span className="block text-xs sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {appUrl || "Lade Adresse..."}
              </span>
            </div>
          </div>
          {appUrl && (
            <button
              type="button"
              onClick={() => copyToClipboard(appUrl, "url")}
              className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors shrink-0"
              title="Adresse kopieren"
            >
              {copiedField === "url" ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {/* Username */}
        <div className="flex items-center justify-between gap-3 bg-white dark:bg-zinc-800 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center gap-2.5 min-w-0">
            <User className="w-4 h-4 text-blue-500 shrink-0" />
            <div className="min-w-0">
              <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">Benutzername</span>
              <span className="block text-xs sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {childUsername}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => copyToClipboard(childUsername, "username")}
            className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors shrink-0"
            title="Benutzername kopieren"
          >
            {copiedField === "username" ? (
              <Check className="w-4 h-4 text-emerald-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Password Notice */}
        <div className="flex items-center justify-between gap-3 bg-white dark:bg-zinc-800 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center gap-2.5 min-w-0">
            <Key className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="min-w-0">
              <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">Passwort</span>
              <span className="block text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Teile das Kennwort deinem Kind persönlich mit 🤫
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* PWA / Homescreen Instructions */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <h3 className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Tipp: Als App auf dem Homescreen ablegen
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-zinc-600 dark:text-zinc-300">
          <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700/60 space-y-1.5">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <span>🍏 iPhone & iPad (Safari)</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[11.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              <li>Web-Adresse in Safari öffnen</li>
              <li>Unten auf das <strong>Teilen-Symbol</strong> tippen (Viereck mit Pfeil ↑)</li>
              <li><strong>„Zum Home-Bildschirm“</strong> auswählen</li>
            </ol>
          </div>

          <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700/60 space-y-1.5">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <span>🤖 Android (Google Chrome)</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[11.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              <li>Web-Adresse in Chrome öffnen</li>
              <li>Oben rechts auf das <strong>Drei-Punkte-Menü (⋮)</strong> tippen</li>
              <li><strong>„App installieren“</strong> oder <strong>„Zum Startbildschirm“</strong> wählen</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="pt-2 flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={handleShare}
          className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <Share2 className="w-4 h-4" />
          <span>Infos an Kind teilen</span>
        </button>

        <button
          type="button"
          onClick={() => copyToClipboard(generateShareText(), "all")}
          className="py-3 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
        >
          {copiedField === "all" ? (
            <>
              <Check className="w-4 h-4 text-emerald-500" />
              <span>Text kopiert!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Text kopieren</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onFinish}
          className="py-3 px-5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-1.5 shadow-sm"
        >
          <span>Weiter zum Trainer</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
