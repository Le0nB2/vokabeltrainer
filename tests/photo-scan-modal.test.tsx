import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import React from "react"
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react"
import { PhotoScanModal } from "@/components/PhotoScanModal"

describe("PhotoScanModal component", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("renders upload dialog when opened", () => {
    render(<PhotoScanModal deckId="deck-123" isOpen={true} onClose={vi.fn()} />)

    expect(screen.getByText("Foto scannen")).toBeDefined()
    expect(screen.getByText("Lade ein Foto deiner Vokabelliste hoch. Die KI extrahiert die Wörter.")).toBeDefined()
    expect(screen.getByText("Bild analysieren")).toBeDefined()
  })

  it("does not render when isOpen is false", () => {
    const { container } = render(<PhotoScanModal deckId="deck-123" isOpen={false} onClose={vi.fn()} />)
    expect(container.innerHTML).toBe("")
  })

  it("shows progress indicators and elapsed timer when scanning starts", async () => {
    // Mock global fetch
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {})) // Never resolves immediately

    render(<PhotoScanModal deckId="deck-123" isOpen={true} onClose={vi.fn()} />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const dummyFile = new File(["dummy content"], "vokabeln.jpg", { type: "image/jpeg" })

    fireEvent.change(fileInput, { target: { files: [dummyFile] } })

    const scanButton = screen.getByText("Bild analysieren")
    fireEvent.click(scanButton)

    // Should immediately show progress elements
    expect(screen.getByText("Bild wird hochgeladen & vorbereitet")).toBeDefined()
    expect(screen.getByText("0s")).toBeDefined()
    expect(screen.getByText("Analyse abbrechen")).toBeDefined()

    // Advance time by 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(screen.getByText("5s")).toBeDefined()
    expect(screen.getByText("Buchseite wird optisch erfasst")).toBeDefined()

    // Advance time by 15 more seconds (total 20s)
    act(() => {
      vi.advanceTimersByTime(15000)
    })

    expect(screen.getByText("20s")).toBeDefined()
    expect(screen.getByText("Didaktische Aufbereitung läuft")).toBeDefined()
  })

  it("allows cancelling an in-flight scan", async () => {
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}))

    render(<PhotoScanModal deckId="deck-123" isOpen={true} onClose={vi.fn()} />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const dummyFile = new File(["dummy content"], "vokabeln.jpg", { type: "image/jpeg" })
    fireEvent.change(fileInput, { target: { files: [dummyFile] } })

    fireEvent.click(screen.getByText("Bild analysieren"))

    expect(screen.getByText("Analyse abbrechen")).toBeDefined()

    // Click cancel
    fireEvent.click(screen.getByText("Analyse abbrechen"))

    // Should return to upload screen and show cancellation notice
    expect(screen.getByText("Bildanalyse abgebrochen.")).toBeDefined()
    expect(screen.getByText("Bild analysieren")).toBeDefined()
  })

  it("shows extracted cards immediately in preview and enriches blocks live", async () => {
    vi.useRealTimers()

    global.fetch = vi
      .fn()
      // 1. Call: Fast OCR from /api/scan-image
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cards: [
            { id: "scan_1", front: "apple", back: "der Apfel", notes: "", phonetic: "" },
            { id: "scan_2", front: "book", back: "das Buch", notes: "", phonetic: "" },
          ],
        }),
      } as any)
      // 2. Call: Block 1 enrichment from /api/enrich-csv
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cards: [
            {
              id: "scan_1",
              gapText: "I eat an ___",
              mnemonic: "Apfel-Eselsbrücke",
              contextSentence: "I eat an apple",
            },
            {
              id: "scan_2",
              gapText: "Read a ___",
              mnemonic: "Buch-Eselsbrücke",
              contextSentence: "Read a book",
            },
          ],
        }),
      } as any)

    render(<PhotoScanModal deckId="deck-123" isOpen={true} onClose={vi.fn()} />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const dummyFile = new File(["dummy"], "vokabeln.jpg", { type: "image/jpeg" })
    fireEvent.change(fileInput, { target: { files: [dummyFile] } })
    fireEvent.click(screen.getByText("Bild analysieren"))

    // Preview must open immediately showing the block panel and card rows
    await waitFor(() => {
      expect(screen.getByText("Erkannte Vokabeln (Vorschau)")).toBeDefined()
      expect(screen.getByText(/Block 1 \(1–2\):/)).toBeDefined()
      expect(screen.getByDisplayValue("apple")).toBeDefined()
    })

    // Enriched mnemonic should populate live once /api/enrich-csv resolves
    await waitFor(() => {
      expect(screen.getByDisplayValue("Apfel-Eselsbrücke")).toBeDefined()
      expect(screen.getByDisplayValue("Read a ___")).toBeDefined()
    })
  })

  it("moves remaining blocks to background on 429 quota without showing other AI provider hints", async () => {
    vi.useRealTimers()

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cards: [{ id: "scan_1", front: "dog", back: "der Hund", notes: "", phonetic: "" }],
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          error:
            "Kontingent aller Schlüssel erschöpft. Die restlichen Karten werden im Hintergrund vervollständigt.",
          quotaExhausted: true,
        }),
      } as any)

    render(<PhotoScanModal deckId="deck-123" isOpen={true} onClose={vi.fn()} />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const dummyFile = new File(["dummy"], "vokabeln.jpg", { type: "image/jpeg" })
    fireEvent.change(fileInput, { target: { files: [dummyFile] } })
    fireEvent.click(screen.getByText("Bild analysieren"))

    await waitFor(() => {
      expect(screen.getAllByText(/Kontingent aller Schlüssel erschöpft/).length).toBeGreaterThan(0)
      expect(screen.getAllByText("Hintergrund").length).toBeGreaterThan(0)
    })

    // Ensure no alternative AI provider hint appears
    const bodyText = document.body.textContent || ""
    expect(bodyText).not.toMatch(/OpenAI|ChatGPT|OpenRouter/i)
  })
})
