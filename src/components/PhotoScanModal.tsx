"use client"

import { useState } from "react"
import { addCardsBulk } from "@/actions/cards"
import { UploadCloud, Loader2, Trash2, Plus } from "lucide-react"

interface PhotoScanModalProps {
  deckId: string
  isOpen: boolean
  onClose: () => void
}

interface ExtractedCard {
  front: string
  back: string
  notes?: string
  gapText?: string
  mnemonic?: string
  contextSentence?: string
}

export function PhotoScanModal({ deckId, isOpen, onClose }: PhotoScanModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [extractedCards, setExtractedCards] = useState<ExtractedCard[]>([])
  const [step, setStep] = useState<"upload" | "preview">("upload")

  if (!isOpen) return null

  const handleScan = async () => {
    if (!file) return
    setIsScanning(true)
    setError("")

    const maxRetries = 8
    const retryDelay = 5000

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const formData = new FormData()
        formData.append("image", file)

        const res = await fetch("/api/scan-image", {
          method: "POST",
          body: formData,
        })

        if (!res.ok) {
          const errorData = await res.json()
          const errorMsg = errorData.error || "Upload failed"
          // We can attach the status so the catch block knows it's 429
          const error = new Error(errorMsg)
          ;(error as Error & { status?: number }).status = res.status
          throw error
        }

        const data = await res.json()
        if (data.cards && Array.isArray(data.cards)) {
          setExtractedCards(data.cards)
          setStep("preview")
          break // Success, exit loop
        } else {
          throw new Error("Invalid response format from AI")
        }
      } catch (err: unknown) {
        const errorMessage = (err as Error).message || String(err)

        if ((err as Error & { status?: number }).status === 429) {
          // If we receive our customized 429 error message (all quotas exhausted), show it exactly as is
          setError(errorMessage)
          console.error("Quota exhausted:", err)
          break // Stop retrying immediately
        }

        const isTrafficError = errorMessage.includes("503") || errorMessage.includes("high demand") || errorMessage.includes("UNAVAILABLE")

        if (isTrafficError && attempt < maxRetries) {
          setError(`${attempt}. Versuch zur Analyse (hoher Traffic) -> Erneuter Versuch in 5 Sek.`)
          await new Promise(resolve => setTimeout(resolve, retryDelay))
        } else {
          setError("Fehler bei der Bildanalyse: " + errorMessage)
          console.error(err)
          break // Exit loop on normal error or max retries reached
        }
      }
    }

    setIsScanning(false)
  }

  const handleSave = async () => {
    const validCards = extractedCards.filter(c => c.front.trim() && c.back.trim())
    if (validCards.length === 0) {
      setError("Keine gültigen Vokabeln zum Speichern.")
      return
    }

    setIsSubmitting(true)
    try {
      await addCardsBulk(deckId, validCards)
      onClose()
      // Reset state for next open
      setFile(null)
      setExtractedCards([])
      setStep("upload")
    } catch (err) {
      setError("Fehler beim Speichern der Karten.")
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const updateCard = (index: number, field: keyof ExtractedCard, value: string) => {
    const newCards = [...extractedCards]
    newCards[index][field] = value
    setExtractedCards(newCards)
  }

  const removeCard = (index: number) => {
    const newCards = [...extractedCards]
    newCards.splice(index, 1)
    setExtractedCards(newCards)
  }

  const addEmptyCard = () => {
    setExtractedCards([...extractedCards, { front: "", back: "", notes: "", gapText: "", mnemonic: "", contextSentence: "" }])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 w-full max-w-4xl shadow-xl max-h-[90vh] flex flex-col">
        <h2 className="text-xl font-bold mb-4">
          {step === "upload" ? "Foto scannen" : "Erkannte Vokabeln (Vorschau)"}
        </h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {step === "upload" && (
          <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-12 text-center">
            <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-6 md:p-12 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors w-full">
              <UploadCloud className="w-12 h-12 text-zinc-400 mb-4" />
              <p className="mb-4 text-zinc-600 dark:text-zinc-400 text-sm md:text-base">
                Lade ein Foto deiner Vokabelliste hoch. Die KI extrahiert die Wörter.
              </p>
              <input
                type="file"
                accept="image/*"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <span className="bg-zinc-100 dark:bg-zinc-800 px-4 py-2 rounded-lg text-sm font-medium">
                {file ? file.name : 'Datei auswählen...'}
              </span>
            </label>

            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Abbrechen
              </button>
              <button
                onClick={handleScan}
                disabled={!file || isScanning}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isScanning && <Loader2 className="w-4 h-4 animate-spin" />}
                {isScanning ? "Analysiere Bild..." : "Bild analysieren"}
              </button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <>
            <div className="flex-1 overflow-auto border rounded-lg mb-4">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 dark:bg-zinc-800 sticky top-0">
                  <tr>
                    <th className="p-3">Vorderseite</th>
                    <th className="p-3">Rückseite</th>
                    <th className="p-3">Lückentext</th>
                    <th className="p-3">Eselsbrücke</th>
                    <th className="p-3">Beispielsatz</th>
                    <th className="p-3">Notizen</th>
                    <th className="p-3 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {extractedCards.map((card, i) => (
                    <tr key={i} className="border-t dark:border-zinc-800">
                      <td className="p-2">
                        <input
                          value={card.front}
                          onChange={e => updateCard(i, "front", e.target.value)}
                          className="w-full bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-blue-500 outline-none px-1 py-1"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={card.back}
                          onChange={e => updateCard(i, "back", e.target.value)}
                          className="w-full bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-blue-500 outline-none px-1 py-1"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={card.gapText || ""}
                          onChange={e => updateCard(i, "gapText", e.target.value)}
                          className="w-full bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-blue-500 outline-none px-1 py-1"
                          placeholder="z.B. I go to ___"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={card.mnemonic || ""}
                          onChange={e => updateCard(i, "mnemonic", e.target.value)}
                          className="w-full bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-blue-500 outline-none px-1 py-1"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={card.contextSentence || ""}
                          onChange={e => updateCard(i, "contextSentence", e.target.value)}
                          className="w-full bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-blue-500 outline-none px-1 py-1"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={card.notes || ""}
                          onChange={e => updateCard(i, "notes", e.target.value)}
                          className="w-full bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-blue-500 outline-none px-1 py-1"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button onClick={() => removeCard(i)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-2 border-t dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                <button onClick={addEmptyCard} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
                  <Plus className="w-4 h-4" /> Zeile hinzufügen
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-zinc-500">{extractedCards.length} Vokabeln erkannt</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep("upload")}
                  className="px-4 py-2 border rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Zurück
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSubmitting ? "Speichere..." : "Alle importieren"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
