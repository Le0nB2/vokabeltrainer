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
})
