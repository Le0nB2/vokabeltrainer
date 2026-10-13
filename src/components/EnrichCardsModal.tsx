"use client"

import { useState, useEffect } from "react"
import { updateCardsEnrichmentBulk } from "@/actions/cards"
import { Loader2 } from "lucide-react"

type CardType = {
  id: string
  front: string
  back: string
  gapText?: string | null
  mnemonic?: string | null
  contextSentence?: string | null
}

interface EnrichCardsModalProps {
  deckId: string
  cards: CardType[]
  isOpen: boolean
  onClose: () => void
}

export function EnrichCardsModal({ deckId, cards, isOpen, onClose }: EnrichCardsModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState("")

  const cardsToEnrich = cards.filter(c => !c.gapText || !c.mnemonic || !c.contextSentence)

  useEffect(() => {
    if (!isOpen) {
      setIsSubmitting(false)
      setError("")
      setProgress(0)
      setProgressText("")
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleEnrich = async () => {
    if (cardsToEnrich.length === 0) return
    setIsSubmitting(true)
    setError("")
    setProgress(0)
    setProgressText(`Generiere KI-Felder für ${cardsToEnrich.length} Karte(n)...`)

    try {
      const batchSize = 20;
      const enrichedResults: any[] = [];
      const totalBatches = Math.ceil(cardsToEnrich.length / batchSize);

      for (let i = 0; i < cardsToEnrich.length; i += batchSize) {
        const batch = cardsToEnrich.slice(i, i + batchSize);
        const currentBatch = Math.floor(i / batchSize) + 1;

        setProgress(Math.round(((i) / cardsToEnrich.length) * 100))
        setProgressText(`Generiere KI-Felder (Batch ${currentBatch}/${totalBatches})...`)

        const reqBody = {
          cards: batch.map(c => ({ id: c.id, front: c.front, back: c.back }))
        };

        const res = await fetch("/api/enrich-csv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody)
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Fehler bei der KI-Generierung");
        }

        const data = await res.json();
        enrichedResults.push(...data.cards);
      }

      setProgress(100)
      setProgressText("Speichere Karten...")

      // Prepare updates
      const updates = cardsToEnrich.map(c => {
         const enrichment = enrichedResults.find((e: any) => e.id === c.id);
         if (enrichment) {
           return {
             id: c.id,
             gapText: c.gapText || enrichment.gapText,
             mnemonic: c.mnemonic || enrichment.mnemonic,
             contextSentence: c.contextSentence || enrichment.contextSentence
           }
         }
         return { id: c.id };
      }).filter(u => Object.keys(u).length > 1);

      if (updates.length > 0) {
        await updateCardsEnrichmentBulk(deckId, updates);
      }
      onClose()
    } catch (err: any) {
      setError(err.message || "Fehler beim Speichern der Karten.")
      console.error(err)
    } finally {
      setIsSubmitting(false)
      if (error) {
        setProgress(0)
        setProgressText("")
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-xl font-bold mb-4">Lückentext generieren</h2>
        <div className="space-y-4">
          {cardsToEnrich.length > 0 ? (
            <p className="text-sm text-zinc-500">
              Es wurden {cardsToEnrich.length} Karte(n) mit fehlenden Feldern (Lückentext, Eselsbrücke, Beispielsatz) gefunden. Möchtest du diese jetzt über die KI generieren lassen?
            </p>
          ) : (
            <p className="text-sm text-zinc-500">
              Alle Karten in diesem Deck haben bereits Lückentexte, Eselsbrücken und Beispielsätze. Es gibt nichts zu generieren.
            </p>
          )}

          {isSubmitting && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>{progressText}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              Abbrechen
            </button>
            {cardsToEnrich.length > 0 && (
              <button
                onClick={handleEnrich}
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSubmitting ? "Generiere..." : "Generieren"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
