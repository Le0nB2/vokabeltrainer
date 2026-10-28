"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Lock, User, KeyRound, AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react"
import { AppLogo } from "@/components/AppLogo"
import { loginApp } from "@/actions/auth"
import { getSafeRedirectUrl } from "@/lib/utils/url"

export function LoginForm() {
  const searchParams = useSearchParams()
  const redirectParam = searchParams.get("redirect")

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      const result = await loginApp({ username, password })

      if (result.success) {
        const safeTarget = getSafeRedirectUrl(redirectParam, "/")
        const finalTarget = safeTarget === "/login" ? "/" : safeTarget
        window.location.href = finalTarget
      } else {
        setError(result.error || "Anmeldung fehlgeschlagen")
        setIsLoading(false)
      }
    } catch {
      setError("Ein unerwarteter Fehler ist aufgetreten")
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-8">
      <div className="flex flex-col items-center mb-8">
        <AppLogo asHeading size="lg" className="mb-3" />
        <p className="text-zinc-500 dark:text-zinc-400 text-center mt-1 text-sm">
          Bitte melde dich an, um auf deinen N30 Vokabeltrainer zuzugreifen.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900/50 rounded-xl">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5 ml-1">
            Benutzername
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
              <User className="w-4 h-4" />
            </div>
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Benutzername"
              required
              autoFocus
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5 ml-1">
            Passwort
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
              <KeyRound className="w-4 h-4" />
            </div>
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Passwort"
              required
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              tabIndex={-1}
              aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || !username || !password}
          className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm text-sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Wird angemeldet...</span>
            </>
          ) : (
            <span>Anmelden</span>
          )}
        </button>
      </form>
    </div>
  )
}
