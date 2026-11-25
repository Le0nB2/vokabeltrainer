"use client"

import { useState, useEffect, useRef } from "react"
import { saveOrUpdateScannedCards } from "@/actions/cards"
import {
  buildAnalysisBlocks,
  runBlockEnrichment,
  type AnalysisBlock,
  type BlockStatus,
} from "@/lib/enrich-blocks"
import { AnalysisBlocksPanel } from "./AnalysisBlocksPanel"
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
  CheckCircle2,
} from "lucide-react"

interface PhotoScanModalProps {
  deckId: string
  isOpen: boolean
  onClose: () => void
}

interface ExtractedCard {
  id: string
  front: string
  back: string
  notes?: string
  gapText?: string
  mnemonic?: string
  contextSentence?: string
  phonetic?: string
  blockStatus?: BlockStatus
}

const OCR_REQUEST_TIMEOUT_MS = 65000

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

const ROW_STATUS_BADGE: Record<BlockStatus, { label: string; className: string }> = {
  analyzing: {
    label: "Analysiere...",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  },
  queued: {
    label: "Wartend",
    className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  },
  done: {
    label: "Bereit",
    className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  },
  background: {
    label: "Hintergrund",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
}

export function PhotoScanModal({ deckId, isOpen, onClose }: PhotoScanModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [retryInfo, setRetryInfo] = useState<{ attempt: number; maxRetries: number; countdown: number } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [infoMessage, setInfoMessage] = useState("")
  const [extractedCards, setExtractedCards] = useState<ExtractedCard[]>([])
  const [analysisBlocks, setAnalysisBlocks] = useState<AnalysisBlock<ExtractedCard>[]>([])
  const [blockStatusText, setBlockStatusText] = useState("")
  const [hadQuotaDuringScan, setHadQuotaDuringScan] = useState(false)
  const [step, setStep] = useState<"upload" | "preview">("upload")

  const abortControllerRef = useRef<AbortController | null>(null)
  const userAbortedScanRef = useRef(false)
  const enrichAbortRef = useRef<AbortController | null>(null)
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

  // Cleanup active requests when modal unmounts or closes
  useEffect(() => {
    if (!isOpen) {
      abortControllerRef.current?.abort()
      enrichAbortRef.current?.abort()
    }
  }, [isOpen])

  if (!isOpen) return null

  const stopEnrichment = () => {
    if (enrichAbortRef.current) {
      enrichAbortRef.current.abort()
      enrichAbortRef.current = null
    }
  }

  const handleCancelScan = () => {
    userAbortedScanRef.current = true
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
    stopEnrichment()
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
    return {
      title: "Didaktische Aufbereitung läuft",
      desc: "Die Worterkennung dauert etwas länger als üblich – gleich siehst du die erkannten Vokabeln...",
      stepIndex: 3,
    }
  }

  const progressStage = getProgressStage()

  const startLiveBlockEnrichment = async (initialCards: ExtractedCard[]) => {
    stopEnrichment()
    const cardsNeedingEnrichment = initialCards.filter(
      (c) => !c.gapText || !c.mnemonic || !c.contextSentence
    )
    if (cardsNeedingEnrichment.length === 0) return

    const blocks = buildAnalysisBlocks(cardsNeedingEnrichment)
    setAnalysisBlocks(blocks)
    setBlockStatusText("")
    setHadQuotaDuringScan(false)

    const enrichController = new AbortController()
    enrichAbortRef.current = enrichController

    await runBlockEnrichment(blocks, {
      signal: enrichController.signal,
      onBlockStart: (bIdx) => {
        const blockCardIds = new Set(blocks[bIdx].cards.map((c) => c.id))
        setAnalysisBlocks((prev) =>
          prev.map((b, idx) => (idx === bIdx ? { ...b, status: "analyzing" } : b))
        )
        setExtractedCards((prev) =>
          prev.map((c) =>
            blockCardIds.has(c.id) && c.blockStatus !== "done"
              ? { ...c, blockStatus: "analyzing" }
              : c
          )
        )
      },
      onBlockSuccess: (bIdx, enrichedList) => {
        const enrichedMap = new Map(enrichedList.map((e) => [e.id, e]))
        const blockCardIds = new Set(blocks[bIdx].cards.map((c) => c.id))

        setAnalysisBlocks((prev) =>
          prev.map((b, idx) => (idx === bIdx ? { ...b, status: "done" } : b))
        )
        setExtractedCards((prev) =>
          prev.map((c) => {
            if (!blockCardIds.has(c.id)) return c
            const enriched = enrichedMap.get(c.id)
            return {
              ...c,
              gapText: c.gapText || enriched?.gapText || "",
              mnemonic: c.mnemonic || enriched?.mnemonic || "",
              contextSentence: c.contextSentence || enriched?.contextSentence || "",
              blockStatus: "done",
            }
          })
        )
      },
      onRemainingToBackground: (startBlockIdx, info) => {
        const remainingCardIds = new Set(
          blocks.slice(startBlockIdx).flatMap((b) => b.cards.map((c) => c.id))
        )
        setHadQuotaDuringScan(info.isQuota)
        setBlockStatusText(info.message)
        setInfoMessage(info.message)
        setAnalysisBlocks((prev) =>
          prev.map((b, idx) =>
            idx >= startBlockIdx && b.status !== "done" ? { ...b, status: "background" } : b
          )
        )
        setExtractedCards((prev) =>
          prev.map((c) =>
            remainingCardIds.has(c.id) && c.blockStatus !== "done"
              ? { ...c, blockStatus: "background" }
              : c
          )
        )
      },
    })

    if (enrichAbortRef.current === enrichController) {
      enrichAbortRef.current = null
    }
  }

  const handleScan = async () => {
    if (!file) return
    setIsScanning(true)
    setError("")
    setInfoMessage("")
    setRetryInfo(null)
    setAnalysisBlocks([])
    setBlockStatusText("")
    userAbortedScanRef.current = false

    const abortController = new AbortController()
    abortControllerRef.current = abortController
    const timeoutId = setTimeout(() => {
      abortController.abort()
    }, OCR_REQUEST_TIMEOUT_MS)

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
        const errorMsg =
          errorData.error ||
          `Serverfehler bei der Bildanalyse (HTTP ${res.status}). Bitte versuche es erneut.`
        const err = new Error(errorMsg) as Error & { status?: number }
        err.status = res.status
        throw err
      }

      const data = await res.json()

      if (data.cards && Array.isArray(data.cards)) {
        const mappedCards: ExtractedCard[] = data.cards.map((c: any, idx: number) => {
          const hasAllFields = Boolean(c.gapText && c.mnemonic && c.contextSentence)
          return {
            id: c.id || `scan_${Date.now()}_${idx}`,
            front: c.front || "",
            back: c.back || "",
            notes: c.notes || "",
            phonetic: c.phonetic || "",
            gapText: c.gapText || "",
            mnemonic: c.mnemonic || "",
            contextSentence: c.contextSentence || "",
            blockStatus: hasAllFields ? "done" : "queued",
          }
        })

        setExtractedCards(mappedCards)
        setStep("preview")
        setIsScanning(false)

        // Sofortige sichtbare Block-für-Block-Anreicherung in der Vorschau starten
        if (mappedCards.length > 0) {
          void startLiveBlockEnrichment(mappedCards)
        }
      } else {
        throw new Error("Ungültiges Antwortformat der KI erhalten.")
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") {
        if (!userAbortedScanRef.current) {
          setError("Zeitüberschreitung beim Bild-Upload. Bitte prüfe deine Verbindung und versuche es erneut.")
        }
        return
      }

      const errorMessage = (err as Error).message || String(err)
      const prefix = errorMessage.toLowerCase().startsWith("fehler")
        ? ""
        : "Fehler bei der Bildanalyse: "
      setError(`${prefix}${errorMessage}`)
      console.error(err)
    } finally {
      clearTimeout(timeoutId)
      abortControllerRef.current = null
      setIsScanning(false)
    }
  }

  const handleSave = async () => {
    const validCards = extractedCards.filter((c) => c.front.trim() && c.back.trim())
    if (validCards.length === 0) {
      setError("Keine gültigen Vokabeln zum Speichern.")
      return
    }

    stopEnrichment()
    setIsSubmitting(true)
    try {
      const preparedForDb = validCards.map((c) => {
        const isComplete = Boolean(
          c.gapText?.trim() && c.mnemonic?.trim() && c.contextSentence?.trim()
        )
        return {
          id: c.id,
          front: c.front,
          back: c.back,
          notes: c.notes,
          phonetic: c.phonetic,
          gapText: c.gapText || null,
          mnemonic: c.mnemonic || null,
          contextSentence: c.contextSentence || null,
          enrichmentStatus: isComplete ? "DONE" : "PENDING",
        }
      })

      await saveOrUpdateScannedCards(deckId, preparedForDb, {
        waitInitial: hadQuotaDuringScan,
      })

      onClose()
      setFile(null)
      setExtractedCards([])
      setAnalysisBlocks([])
      setInfoMessage("")
      setStep("upload")
    } catch (err) {
      setError("Fehler beim Speichern der Karten.")
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const updateCard = (
    index: number,
    field: "front" | "back" | "notes" | "gapText" | "mnemonic" | "contextSentence" | "phonetic",
    value: string
  ) => {
    const newCards = [...extractedCards]
    newCards[index] = { ...newCards[index], [field]: value }
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
      {
        id: `scan_manual_${Date.now()}`,
        front: "",
        back: "",
        notes: "",
        gapText: "",
        mnemonic: "",
        contextSentence: "",
        phonetic: "",
        blockStatus: "done",
      },
    ])
  }

  const isEnrichmentActive = analysisBlocks.some(
    (b) => b.status === "analyzing" || b.status === "queued"
  )
  const pendingOrBackgroundCount = extractedCards.filter(
    (c) =>
      c.front.trim() &&
      c.back.trim() &&
      (!c.gapText?.trim() || !c.mnemonic?.trim() || !c.contextSentence?.trim())
  ).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 w-full max-w-5xl shadow-xl max-h-[90vh] flex flex-col">
        <h2 className="text-xl font-bold mb-4">
          {step === "upload" ? "Foto scannen" : "Erkannte Vokabeln (Vorschau)"}
        </h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        {infoMessage && (
          <div className="mb-4 p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 flex items-center gap-3 text-sm">
            <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
            <span>{infoMessage}</span>
          </div>
        )}

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
            <AnalysisBlocksPanel blocks={analysisBlocks} statusText={blockStatusText || undefined} />

            <div className="flex-1 overflow-auto border rounded-lg mb-4">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 dark:bg-zinc-800 sticky top-0 z-10">
                  <tr>
                    <th className="p-3">Status</th>
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
                  {extractedCards.map((card, i) => {
                    const rowStatus = card.blockStatus || "done"
                    const badge = ROW_STATUS_BADGE[rowStatus]
                    const placeholderText =
                      rowStatus === "analyzing"
                        ? "Wird analysiert..."
                        : rowStatus === "queued"
                        ? "In Warteschlange..."
                        : rowStatus === "background"
                        ? "Wird im Hintergrund ergänzt"
                        : ""

                    return (
                      <tr
                        key={card.id || i}
                        className={`border-t dark:border-zinc-800 ${
                          rowStatus === "analyzing" ? "bg-blue-50/40 dark:bg-blue-950/20" : ""
                        }`}
                      >
                        <td className="p-2 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
                          >
                            {rowStatus === "analyzing" && <Loader2 className="w-3 h-3 animate-spin" />}
                            {rowStatus === "queued" && <Clock className="w-3 h-3" />}
                            {rowStatus === "done" && <CheckCircle2 className="w-3 h-3" />}
                            {rowStatus === "background" && <Clock className="w-3 h-3" />}
                            {badge.label}
                          </span>
                        </td>
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
                            placeholder={placeholderText || "z.B. I go to ___"}
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
                            placeholder={placeholderText}
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
                            placeholder={placeholderText}
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
                    )
                  })}
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

            <div className="flex flex-wrap justify-between items-center gap-2">
              <span className="text-sm text-zinc-500">
                {extractedCards.length} Vokabeln erkannt
                {isEnrichmentActive && " · KI-Aufbereitung läuft live"}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    stopEnrichment()
                    setAnalysisBlocks([])
                    setInfoMessage("")
                    setStep("upload")
                  }}
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
                  {isSubmitting
                    ? "Speichere..."
                    : pendingOrBackgroundCount > 0 && isEnrichmentActive
                    ? "Speichern & Rest im Hintergrund"
                    : "Alle importieren"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
