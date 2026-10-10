"use client"

import { useState, useEffect } from "react"
import { updateCardDetails } from "@/actions/cards"

type CardType = {
  id: string
  front: string
  back: string
  notes?: string | null
  gapText?: string | null
  mnemonic?: string | null
  contextSentence?: string | null
}

interface EditCardModalProps {
  deckId: string
  card: CardType | null
  isOpen: boolean
  onClose: () => void
}

export function EditCardModal({ deckId, card, isOpen, onClose }: EditCardModalProps) {
  const [front, setFront] = useState("")
  const [back, setBack] = useState("")
  const [gapText, setGapText] = useState("")
  const [mnemonic, setMnemonic] = useState("")
  const [contextSentence, setContextSentence] = useState("")
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (card) {
      setFront(card.front)
      setBack(card.back)
      setGapText(card.gapText || "")
      setMnemonic(card.mnemonic || "")
      setContextSentence(card.contextSentence || "")
      setNotes(card.notes || "")
    }
  }, [card])

  if (!isOpen || !card) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await updateCardDetails(
        card.id,
        deckId,
        front,
        back,
        notes || undefined,
        gapText || undefined,
        mnemonic || undefined,
        contextSentence || undefined
      )
      onClose()
    } catch (err) {
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Vokabel bearbeiten</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Vorderseite (Ausgangswort)</label>
            <input
              required
              value={front}
              onChange={e => setFront(e.target.value)}
              className="w-full border rounded-lg p-2 dark:bg-zinc-800 dark:border-zinc-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Rückseite (Übersetzung)</label>
            <input
              required
              value={back}
              onChange={e => setBack(e.target.value)}
              className="w-full border rounded-lg p-2 dark:bg-zinc-800 dark:border-zinc-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Lückentext (optional)</label>
            <input
              value={gapText}
              onChange={e => setGapText(e.target.value)}
              placeholder="z.B. I go to ___"
              className="w-full border rounded-lg p-2 dark:bg-zinc-800 dark:border-zinc-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Eselsbrücke (optional)</label>
            <input
              value={mnemonic}
              onChange={e => setMnemonic(e.target.value)}
              placeholder="Merkhilfe / Bildhafte Assoziation"
              className="w-full border rounded-lg p-2 dark:bg-zinc-800 dark:border-zinc-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Beispielsatz (optional)</label>
            <input
              value={contextSentence}
              onChange={e => setContextSentence(e.target.value)}
              placeholder="Beispielsatz zur Erläuterung"
              className="w-full border rounded-lg p-2 dark:bg-zinc-800 dark:border-zinc-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notizen (optional)</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full border rounded-lg p-2 dark:bg-zinc-800 dark:border-zinc-700"
            />
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
