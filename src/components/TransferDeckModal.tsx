"use client"

import { useState, useEffect } from "react"
import { getAssignableUsers, transferDeck } from "@/actions/decks"
import { Users, Loader2, ArrowRight } from "lucide-react"

interface TransferDeckModalProps {
  deckId: string
  isOpen: boolean
  onClose: () => void
}

export function TransferDeckModal({ deckId, isOpen, onClose }: TransferDeckModalProps) {
  const [users, setUsers] = useState<Array<{ id: string; username: string; displayName: string | null; role: string }>>([])
  const [selectedUserId, setSelectedUserId] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setFetching(true)
      setError(null)
      getAssignableUsers()
        .then((res) => {
          setUsers(res)
          if (res.length > 0) {
            setSelectedUserId(res[0].id)
          }
        })
        .catch(() => setError("Benutzer konnten nicht geladen werden."))
        .finally(() => setFetching(false))
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleTransfer = async () => {
    if (!selectedUserId) return
    setLoading(true)
    setError(null)
    try {
      await transferDeck(deckId, selectedUserId)
      onClose()
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("Fehler beim Übertragen des Stapels.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm sm:text-base">
              Vokabelstapel übertragen
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Weise diesen Stapel einem anderen Profil zu.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {fetching ? (
          <div className="py-6 flex items-center justify-center text-zinc-500 text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Lade Profile...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="py-4 space-y-4">
            <p className="text-xs text-zinc-500">
              Es sind keine weiteren Benutzerkonten vorhanden, auf die dieser Stapel übertragen werden kann.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Schließen
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Neuer Besitzer:
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName || u.username} ({u.role === "ADMIN" ? "Eltern" : "Kind"})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={loading || !selectedUserId}
                onClick={handleTransfer}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                <span>Übertragen</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
