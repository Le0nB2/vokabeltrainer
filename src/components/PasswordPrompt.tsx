"use client"

import { useState } from "react"
import { ShieldCheck, ArrowLeft, Info } from "lucide-react"
import { checkPassword } from "@/actions/auth"
import Link from "next/link"

export function PasswordPrompt() {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      const result = await checkPassword(password)

      if (result.success) {
        window.location.reload()
      } else {
        setError(result.error || "Ein Fehler ist aufgetreten")
        setIsLoading(false)
      }
    } catch {
      setError("Ein unerwarteter Fehler ist aufgetreten")
      setIsLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Zurück zur Übersicht
        </Link>

        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4 text-blue-600 dark:text-blue-400">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Kindersicherung</h1>
          <p className="text-zinc-600 dark:text-zinc-400 text-center mt-2 text-sm leading-relaxed">
            Kindersicherung: Verhindert, dass Kinder beim Vokabellernen Einstellungen verändern.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="PIN oder Kennwort"
              required
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow text-center tracking-wider text-lg"
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {isLoading ? "Überprüfe..." : "Entsperren"}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-800 flex items-start gap-2.5 text-xs text-zinc-500 dark:text-zinc-400">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
          <span>Tipp: Du kannst diesen Bereich auch mit deinem Eltern-Anmeldekennwort entsperren.</span>
        </div>
      </div>
    </main>
  )
}
