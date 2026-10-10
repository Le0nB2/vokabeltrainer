"use client"

import { useState } from "react"
import { addCardsBulk } from "@/actions/cards"
import Papa from "papaparse"
import { Loader2 } from "lucide-react"

interface CsvImportModalProps {
  deckId: string
  isOpen: boolean
  onClose: () => void
}

export function CsvImportModal({ deckId, isOpen, onClose }: CsvImportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState("")

  if (!isOpen) return null

  const handleImport = async () => {
    if (!file) return
    setIsSubmitting(true)
    setError("")
    setProgress(0)
    setProgressText("Parse CSV...")

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let cards = results.data.map((row: any, index: number) => {
            // Support standard fields with fallbacks
            const keys = Object.keys(row)
            const front = row.front || row[keys[0]] || ""
            const back = row.back || row[keys[1]] || ""
            const notes = row.notes || row[keys[2]] || undefined
            const gapText = row.gapText || row.gap_text || row.lückentext || undefined
            const mnemonic = row.mnemonic || row.eselsbrücke || undefined
            const contextSentence = row.contextSentence || row.context_sentence || row.beispielsatz || undefined
            return { id: `card_${index}`, front, back, notes, gapText, mnemonic, contextSentence }
          }).filter(c => c.front && c.back)

          if (cards.length === 0) {
            setError("Keine gültigen Vokabeln gefunden. Stelle sicher, dass die CSV 'front' und 'back' Spalten hat.")
            setIsSubmitting(false)
            return
          }

          const cardsToEnrich = cards.filter(c => !c.gapText || !c.mnemonic || !c.contextSentence)

          if (cardsToEnrich.length > 0) {
            setProgressText(`Generiere KI-Felder für ${cardsToEnrich.length} Karte(n)...`)

            // Process in batches to avoid huge payloads and long timeouts
            const batchSize = 30;
            const enrichedResults: any[] = [];

            for (let i = 0; i < cardsToEnrich.length; i += batchSize) {
              const batch = cardsToEnrich.slice(i, i + batchSize);

              setProgress(Math.round(((i) / cardsToEnrich.length) * 100))
              setProgressText(`Generiere KI-Felder (Batch ${Math.floor(i/batchSize)+1}/${Math.ceil(cardsToEnrich.length/batchSize)})...`)

              const reqBody = {
                cards: batch.map(c => ({ id: c.id, front: c.front, back: c.back }))
              };

              const res = await fetch("/api/enrich-csv", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reqBody)
              });

              if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Fehler bei der KI-Generierung");
              }

              const data = await res.json();
              enrichedResults.push(...data.cards);
            }

            // Merge back
            setProgress(100)
            setProgressText("Speichere Karten...")

            cards = cards.map(c => {
               const enrichment = enrichedResults.find((e: any) => e.id === c.id);
               if (enrichment) {
                 return {
                   ...c,
                   gapText: c.gapText || enrichment.gapText,
                   mnemonic: c.mnemonic || enrichment.mnemonic,
                   contextSentence: c.contextSentence || enrichment.contextSentence
                 }
               }
               return c;
            });
          } else {
             setProgress(100)
             setProgressText("Speichere Karten...")
          }

          // Remove id before saving as it is not needed by addCardsBulk
          const finalCards = cards.map(({ id, ...rest }) => rest);
          await addCardsBulk(deckId, finalCards)
          setFile(null)
          onClose()
        } catch (err: any) {
          setError(err.message || "Fehler beim Speichern der Karten.")
          console.error(err)
        } finally {
          setIsSubmitting(false)
          setProgress(0)
          setProgressText("")
        }
      },
      error: (err) => {
        setError("Fehler beim Parsen der CSV: " + err.message)
        setIsSubmitting(false)
        setProgress(0)
        setProgressText("")
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-xl font-bold mb-4">CSV Import</h2>
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">
            Lade eine CSV Datei hoch. Erwartete Spalten: <code>front</code>, <code>back</code>, sowie optional <code>gapText</code> (Lückentext), <code>mnemonic</code> (Eselsbrücke), <code>contextSentence</code> (Beispielsatz) und <code>notes</code>. Fehlen die optionalen Felder, werden sie automatisch generiert.
          </p>
          <input
            type="file"
            accept=".csv"
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="w-full border rounded-lg p-2 dark:bg-zinc-800 dark:border-zinc-700"
            disabled={isSubmitting}
          />

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
