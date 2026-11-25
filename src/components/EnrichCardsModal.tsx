"use client"

import { useState, useEffect, useRef } from "react"
import { updateCardsEnrichmentBulk } from "@/actions/cards"
import {
  buildAnalysisBlocks,
  runBlockEnrichment,
  type AnalysisBlock,
} from "@/lib/enrich-blocks"
import { AnalysisBlocksPanel } from "./AnalysisBlocksPanel"
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
  const [statusText, setStatusText] = useState("")
  const [analysisBlocks, setAnalysisBlocks] = useState<AnalysisBlock<CardType>[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const cardsToEnrich = cards.filter((c) => !c.gapText || !c.mnemonic || !c.contextSentence)

  useEffect(() => {
    if (!isOpen) {
      abortRef.current?.abort()
      setIsSubmitting(false)
      setError("")
      setStatusText("")
      setAnalysisBlocks([])
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleEnrich = async () => {
    if (cardsToEnrich.length === 0) return
    setIsSubmitting(true)
    setError("")

    const blocks = buildAnalysisBlocks(cardsToEnrich)
    setAnalysisBlocks(blocks)
    setStatusText(`Generiere KI-Felder in ${blocks.length} Block/Blöcken...`)

    const controller = new AbortController()
    abortRef.current = controller
    const cardLookup = new Map(cardsToEnrich.map((c) => [c.id, c]))

    try {
      let hadBackgroundFallback = false

      const outcome = await runBlockEnrichment(blocks, {
        signal: controller.signal,
        onBlockStart: (bIdx) => {
          setAnalysisBlocks((prev) =>
            prev.map((b, idx) => (idx === bIdx ? { ...b, status: "analyzing" } : b))
          )
        },
        onBlockSuccess: async (bIdx, enrichedList) => {
          const updates = enrichedList
            .map((e) => {
              const orig = cardLookup.get(e.id)
              if (!orig) return null
              return {
                id: orig.id,
                gapText: orig.gapText || e.gapText,
                mnemonic: orig.mnemonic || e.mnemonic,
                contextSentence: orig.contextSentence || e.contextSentence,
                enrichmentStatus: "DONE",
              }
            })
            .filter((u): u is NonNullable<typeof u> => u !== null)

          if (updates.length > 0) {
            await updateCardsEnrichmentBulk(deckId, updates)
          }

          setAnalysisBlocks((prev) =>
            prev.map((b, idx) => (idx === bIdx ? { ...b, status: "done" } : b))
          )
        },
        onRemainingToBackground: async (startBlockIdx, info) => {
          hadBackgroundFallback = true
          setStatusText(info.message)
          setAnalysisBlocks((prev) =>
            prev.map((b, idx) =>
              idx >= startBlockIdx && b.status !== "done" ? { ...b, status: "background" } : b
            )
          )

          const remainingUpdates = blocks
            .slice(startBlockIdx)
            .flatMap((b) => b.cards)
            .map((c) => ({
              id: c.id,
              enrichmentStatus: "PENDING",
            }))

          if (remainingUpdates.length > 0) {
            await updateCardsEnrichmentBulk(deckId, remainingUpdates, { waitInitial: info.isQuota })
          }
        },
      })

      if (outcome.aborted) {
        return
      }

      if (hadBackgroundFallback) {
        await new Promise((r) => setTimeout(r, 2000))
      }

      onClose()
    } catch (err: any) {
      setError(err.message || "Fehler beim Speichern der Karten.")
      console.error(err)
    } finally {
      abortRef.current = null
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 w-full max-w-lg shadow-xl">
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

          {isSubmitting && analysisBlocks.length > 0 && (
            <AnalysisBlocksPanel blocks={analysisBlocks} statusText={statusText || undefined} />
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={() => {
                abortRef.current?.abort()
                onClose()
              }}
              className="px-4 py-2 border rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
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
