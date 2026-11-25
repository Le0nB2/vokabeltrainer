"use client"

import { useState, useRef, useEffect } from "react"
import { addCardsBulk } from "@/actions/cards"
import {
  buildAnalysisBlocks,
  runBlockEnrichment,
  type AnalysisBlock,
} from "@/lib/enrich-blocks"
import { AnalysisBlocksPanel } from "./AnalysisBlocksPanel"
import Papa from "papaparse"
import { Loader2 } from "lucide-react"

interface CsvImportModalProps {
  deckId: string
  isOpen: boolean
  onClose: () => void
}

function sanitizeCsvField(val: string | undefined): string | undefined {
  if (!val) return val
  const trimmed = val.trim()
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`
  }
  return val
}

export function CsvImportModal({ deckId, isOpen, onClose }: CsvImportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [statusText, setStatusText] = useState("")
  const [analysisBlocks, setAnalysisBlocks] = useState<AnalysisBlock<any>[]>([])
  const abortRef = useRef<AbortController | null>(null)

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

  const handleImport = async () => {
    if (!file) return
    setIsSubmitting(true)
    setError("")
    setStatusText("Parse CSV...")
    setAnalysisBlocks([])

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          let cards = results.data
            .map((row, index: number) => {
              const keys = Object.keys(row)
              const front = sanitizeCsvField(row.front || row[keys[0]] || "") || ""
              const back = sanitizeCsvField(row.back || row[keys[1]] || "") || ""
              const notes = sanitizeCsvField(row.notes || row[keys[2]])
              const gapText = sanitizeCsvField(row.gapText || row.gap_text || row.lückentext)
              const mnemonic = sanitizeCsvField(row.mnemonic || row.eselsbrücke)
              const contextSentence = sanitizeCsvField(
                row.contextSentence || row.context_sentence || row.beispielsatz
              )
              return { id: `card_${index}`, front, back, notes, gapText, mnemonic, contextSentence }
            })
            .filter((c) => c.front && c.back)

          if (cards.length === 0) {
            setError(
              "Keine gültigen Vokabeln gefunden. Stelle sicher, dass die CSV 'front' und 'back' Spalten hat."
            )
            setIsSubmitting(false)
            return
          }

          const cardsToEnrich = cards.filter(
            (c) => !c.gapText || !c.mnemonic || !c.contextSentence
          )

          let hadBackgroundFallback = false
          let hadQuota = false
          const enrichedResults = new Map<string, any>()

          if (cardsToEnrich.length > 0) {
            const blocks = buildAnalysisBlocks(cardsToEnrich)
            setAnalysisBlocks(blocks)
            setStatusText(`Starte KI-Analyse in ${blocks.length} Block/Blöcken...`)

            const controller = new AbortController()
            abortRef.current = controller

            const outcome = await runBlockEnrichment(blocks, {
              signal: controller.signal,
              onBlockStart: (bIdx) => {
                setAnalysisBlocks((prev) =>
                  prev.map((b, idx) => (idx === bIdx ? { ...b, status: "analyzing" } : b))
                )
              },
              onBlockSuccess: (bIdx, enrichedList) => {
                for (const item of enrichedList) {
                  enrichedResults.set(item.id, item)
                }
                setAnalysisBlocks((prev) =>
                  prev.map((b, idx) => (idx === bIdx ? { ...b, status: "done" } : b))
                )
              },
              onRemainingToBackground: (startBlockIdx, info) => {
                hadBackgroundFallback = true
                hadQuota = info.isQuota
                setStatusText(info.message)
                setAnalysisBlocks((prev) =>
                  prev.map((b, idx) =>
                    idx >= startBlockIdx && b.status !== "done"
                      ? { ...b, status: "background" }
                      : b
                  )
                )
              },
            })

            if (outcome.aborted) {
              return
            }
          }

          if (!hadBackgroundFallback) {
            setStatusText("Speichere Karten...")
          }

          const cardsToSave = cards.map((c) => {
            const enrichment = enrichedResults.get(c.id)
            const finalGap = c.gapText || enrichment?.gapText || null
            const finalMnemonic = c.mnemonic || enrichment?.mnemonic || null
            const finalContext = c.contextSentence || enrichment?.contextSentence || null
            const needsEnrichment = !finalGap || !finalMnemonic || !finalContext

            return {
              front: c.front,
              back: c.back,
              notes: c.notes,
              gapText: finalGap,
              mnemonic: finalMnemonic,
              contextSentence: finalContext,
              enrichmentStatus: needsEnrichment ? "PENDING" : "DONE",
            }
          })

          await addCardsBulk(deckId, cardsToSave as any, { waitInitial: hadQuota })

          if (hadBackgroundFallback) {
            await new Promise((r) => setTimeout(r, 2000))
          }

          setFile(null)
          onClose()
        } catch (err: any) {
          setError(err.message || "Fehler beim Speichern der Karten.")
          console.error(err)
        } finally {
          abortRef.current = null
          setIsSubmitting(false)
        }
      },
      error: (err) => {
        setError("Fehler beim Parsen der CSV: " + err.message)
        setIsSubmitting(false)
        setStatusText("")
      },
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 w-full max-w-lg shadow-xl">
        <h2 className="text-xl font-bold mb-4">CSV Import</h2>
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">
            Lade eine CSV Datei hoch. Erwartete Spalten: <code>front</code>, <code>back</code>, sowie optional <code>gapText</code> (Lückentext), <code>mnemonic</code> (Eselsbrücke), <code>contextSentence</code> (Beispielsatz) und <code>notes</code>. Fehlen die optionalen Felder, werden sie automatisch generiert.
          </p>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full border rounded-lg p-2 dark:bg-zinc-800 dark:border-zinc-700"
            disabled={isSubmitting}
          />

          {isSubmitting && analysisBlocks.length > 0 && (
            <AnalysisBlocksPanel blocks={analysisBlocks} statusText={statusText || undefined} />
          )}

          {isSubmitting && analysisBlocks.length === 0 && statusText && (
            <p className="text-xs text-zinc-500">{statusText}</p>
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
            <button
              onClick={handleImport}
              disabled={!file || isSubmitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? "Importiere..." : "Importieren"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
