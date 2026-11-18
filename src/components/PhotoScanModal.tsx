"use client"

import { useState, useEffect, useRef } from "react"
import { addCardsBulk } from "@/actions/cards"
import {
  UploadCloud,
  Loader2,
  Trash2,
  Plus,
  ShieldAlert,
  Sparkles,
  Clock,
  RefreshCw,
  XCircle,
} from "lucide-react"

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
  phonetic?: string
}

/**
 * Optimizes huge smartphone photos (e.g. 12-48MP / 8-15MB) to max 2048px before upload.
 * Keeps text crisp and sharp, but reduces upload payload from 10MB to ~600KB,
 * speeding up upload and Gemini inference significantly.
 */
async function prepareImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type.includes("svg") || file.size < 1.5 * 1024 * 1024) {
    return file
  }

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX_DIM = 2048
      let { width, height } = img

      if (width <= MAX_DIM && height <= MAX_DIM) {
        resolve(file)
        return
      }

      if (width > height) {
        height = Math.round((height * MAX_DIM) / width)
        width = MAX_DIM
      } else {
        width = Math.round((width * MAX_DIM) / height)
        height = MAX_DIM
      }

      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        resolve(file)
        return
      }

      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file)
            return
          }
          const optimizedFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
            type: "image/jpeg",
          })
          resolve(optimizedFile)
        },
        "image/jpeg",
        0.88
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }

    img.src = url
  })
}

export function PhotoScanModal({ deckId, isOpen, onClose }: PhotoScanModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [retryInfo, setRetryInfo] = useState<{ attempt: number; maxRetries: number; countdown: number } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [extractedCards, setExtractedCards] = useState<ExtractedCard[]>([])
  const [step, setStep] = useState<"upload" | "preview">("upload")

  const abortControllerRef = useRef<AbortController | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Manage elapsed timer while scanning
  useEffect(() => {
    if (isScanning) {
      setElapsedSeconds(0)
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1)
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      setRetryInfo(null)
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isScanning])

  if (!isOpen) return null

  const handleCancelScan = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsScanning(false)
    setRetryInfo(null)
    setError("Bildanalyse abgebrochen.")
  }

  const handleModalClose = () => {
    if (isScanning) {
      handleCancelScan()
    }
    onClose()
  }

  // Dynamic progress stage depending on elapsed time
  const getProgressStage = () => {
    if (retryInfo) {
      return {
        title: "Server kurzzeitig ausgelastet",
        desc: `Google Gemini meldet hohe Auslastung. Automatischer Neuversuch in ${retryInfo.countdown}s (Versuch ${retryInfo.attempt} von ${retryInfo.maxRetries})...`,
        stepIndex: 1,
      }
    }
    if (elapsedSeconds < 4) {
      return {
        title: "Bild wird hochgeladen & vorbereitet",
        desc: "Optimiere Bilddaten und sende sie sicher an die KI...",
        stepIndex: 1,
      }
    }
    if (elapsedSeconds < 16) {
      return {
        title: "Buchseite wird optisch erfasst",
        desc: "Die KI erkennt Spalten, englische Vokabeln und deutsche Übersetzungen...",
        stepIndex: 2,
      }
    }
    if (elapsedSeconds < 35) {
      return {
        title: "Didaktische Aufbereitung läuft",
        desc: "Erstelle Eselsbrücken (Keyword-Methode), Beispielsätze, Lückentexte und Lautschrift...",
        stepIndex: 3,
      }
    }
    return {
      title: "Umfangreiche Generierung / KI rechnet noch",
      desc: "Umfangreiche Vokabelliste oder Modell-Warteschlange – bitte kurz Geduld, die Analyse läuft stabil im Hintergrund...",
      stepIndex: 3,
    }
  }

  const progressStage = getProgressStage()

  const handleScan = async () => {
    if (!file) return
    setIsScanning(true)
    setError("")
    setRetryInfo(null)

    const maxRetries = 5
    const retryDelaySec = 5

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      try {
        const uploadFile = await prepareImageForUpload(file)
        const formData = new FormData()
        formData.append("image", uploadFile)

        const res = await fetch("/api/scan-image", {
          method: "POST",
          body: formData,
          signal: abortController.signal,
        })

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}))
          const errorMsg = errorData.error || "Upload failed"
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
          throw new Error("Ungültiges Antwortformat der KI erhalten.")
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") {
          setIsScanning(false)
          return
        }

        const errorMessage = (err as Error).message || String(err)

        if ((err as Error & { status?: number }).status === 429) {
          setError(errorMessage)
          console.error("Quota exhausted:", err)
          break // Stop retrying immediately
        }

        const isTrafficError =
          errorMessage.includes("503") ||
          errorMessage.includes("high demand") ||
          errorMessage.includes("UNAVAILABLE") ||
          errorMessage.includes("overloaded")

        if (isTrafficError && attempt < maxRetries) {
          for (let c = retryDelaySec; c > 0; c--) {
            setRetryInfo({ attempt: attempt + 1, maxRetries, countdown: c })
            await new Promise((resolve) => setTimeout(resolve, 1000))
            if (!abortControllerRef.current) return
          }
          setRetryInfo(null)
        } else {
          const prefix = errorMessage.toLowerCase().startsWith("fehler") ? "" : "Fehler bei der Bildanalyse: "
          setError(`${prefix}${errorMessage}`)
          console.error(err)
          break
        }
      }
    }

    abortControllerRef.current = null
    setIsScanning(false)
  }

  const handleSave = async () => {
    const validCards = extractedCards.filter((c) => c.front.trim() && c.back.trim())
    if (validCards.length === 0) {
      setError("Keine gültigen Vokabeln zum Speichern.")
      return
    }

    setIsSubmitting(true)
    try {
      await addCardsBulk(deckId, validCards)
      onClose()
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
    setExtractedCards([
      ...extractedCards,
      { front: "", back: "", notes: "", gapText: "", mnemonic: "", contextSentence: "", phonetic: "" },
    ])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 w-full max-w-4xl shadow-xl max-h-[90vh] flex flex-col">
        <h2 className="text-xl font-bold mb-4">
          {step === "upload" ? "Foto scannen" : "Erkannte Vokabeln (Vorschau)"}
        </h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {step === "upload" && (
          <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 text-center">
            {isScanning ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-10 text-center w-full max-w-lg mx-auto">
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center animate-pulse">
                    {retryInfo ? (
                      <RefreshCw className="w-10 h-10 text-amber-600 dark:text-amber-400 animate-spin" />
                    ) : (
                      <Sparkles className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                    )}
                  </div>
                  <div className="absolute -bottom-2 -right-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full px-2.5 py-0.5 flex items-center gap-1 shadow-sm text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    <Clock className="w-3.5 h-3.5 text-zinc-500" />
                    <span>{elapsedSeconds}s</span>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                  {progressStage.title}
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6 max-w-md leading-relaxed">
                  {progressStage.desc}
                </p>

                {/* Status-Kacheln */}
                <div className="w-full grid grid-cols-3 gap-2 mb-8 text-xs font-medium">
                  <div
                    className={`p-2 rounded-lg border transition-all ${
                      elapsedSeconds >= 0
                        ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 font-semibold"
                        : "border-zinc-200 dark:border-zinc-800 text-zinc-400"
                    }`}
                  >
                    1. Upload
                  </div>
                  <div
                    className={`p-2 rounded-lg border transition-all ${
                      elapsedSeconds >= 4
                        ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 font-semibold"
                        : "border-zinc-200 dark:border-zinc-800 text-zinc-400"
                    }`}
                  >
                    2. KI-Lesung
                  </div>
                  <div
                    className={`p-2 rounded-lg border transition-all ${
                      elapsedSeconds >= 16
                        ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 font-semibold"
                        : "border-zinc-200 dark:border-zinc-800 text-zinc-400"
                    }`}
                  >
                    3. Didaktik
                  </div>
                </div>

                {/* Abbrechen-Button */}
                <button
                  type="button"
                  onClick={handleCancelScan}
                  className="flex items-center gap-1.5 px-4 py-2 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-sm font-medium transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Analyse abbrechen
                </button>
              </div>
            ) : (
              <>
                <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-6 md:p-12 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors w-full">
                  <UploadCloud className="w-12 h-12 text-zinc-400 mb-4" />
                  <p className="mb-4 text-zinc-600 dark:text-zinc-400 text-sm md:text-base">
                    Lade ein Foto deiner Vokabelliste hoch. Die KI extrahiert die Wörter.
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <span className="bg-zinc-100 dark:bg-zinc-800 px-4 py-2 rounded-lg text-sm font-medium">
                    {file ? file.name : "Datei auswählen..."}
                  </span>
                </label>

                <div className="w-full mt-4 flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300 text-xs md:text-sm text-left">
                  <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>
                    <strong>Hinweis:</strong> Achte darauf, keine persönlichen oder sensiblen Daten mithilfe der KI zu analysieren.
                  </span>
                </div>

                <div className="flex gap-2 mt-6">
                  <button
                    type="button"
                    onClick={handleModalClose}
                    className="px-4 py-2 border rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleScan}
                    disabled={!file}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Bild analysieren
                  </button>
                </div>
              </>
            )}
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
                    <th className="p-3">Lautschrift</th>
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
                          onChange={(e) => updateCard(i, "front", e.target.value)}
                          className="w-full bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-blue-500 outline-none px-1 py-1"
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={card.back}
                          onChange={(e) => updateCard(i, "back", e.target.value)}
                          className="w-full bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-blue-500 outline-none px-1 py-1"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={card.phonetic || ""}
                          onChange={(e) => updateCard(i, "phonetic", e.target.value)}
                          className="w-full bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-blue-500 outline-none px-1 py-1"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={card.gapText || ""}
                          onChange={(e) => updateCard(i, "gapText", e.target.value)}
                          className="w-full bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-blue-500 outline-none px-1 py-1"
                          placeholder="z.B. I go to ___"
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={card.mnemonic || ""}
                          onChange={(e) => updateCard(i, "mnemonic", e.target.value)}
                          className="w-full bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-blue-500 outline-none px-1 py-1"
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={card.contextSentence || ""}
                          onChange={(e) => updateCard(i, "contextSentence", e.target.value)}
                          className="w-full bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-blue-500 outline-none px-1 py-1"
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={card.notes || ""}
                          onChange={(e) => updateCard(i, "notes", e.target.value)}
                          className="w-full bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-blue-500 outline-none px-1 py-1"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => removeCard(i)}
                          className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-2 border-t dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                <button
                  onClick={addEmptyCard}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                >
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
