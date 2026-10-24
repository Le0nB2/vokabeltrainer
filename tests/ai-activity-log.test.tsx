import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { AiActivityLog } from "@/components/AiActivityLog";
import { AiStatusMessage } from "@/lib/services/ai-status";

describe("AiActivityLog component", () => {
  it("renders nothing when history is empty", () => {
    const { container } = render(<AiActivityLog history={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders toggle button with item count and expands/collapses on click", () => {
    const history: AiStatusMessage[] = [
      {
        stage: "init",
        message: "Vokabeln geladen (48 Vokabeln)",
        timestamp: new Date("2026-10-24T17:18:55Z").getTime(),
      },
      {
        stage: "generating",
        message: "KI-Anfrage gestartet",
        timestamp: new Date("2026-10-24T17:18:56Z").getTime(),
      },
    ];

    render(<AiActivityLog history={history} />);

    // Button should show count
    const button = screen.getByRole("button", { name: /Aktivitäten \(2\)/i });
    expect(button).toBeDefined();

    // Initially collapsed
    expect(screen.queryByText(/Vokabeln geladen/i)).toBeNull();

    // Click to open
    fireEvent.click(button);
    expect(screen.getByText(/Vokabeln geladen/i)).toBeDefined();
    expect(screen.getByText(/KI-Anfrage gestartet/i)).toBeDefined();

    // Click to close
    fireEvent.click(button);
    expect(screen.queryByText(/Vokabeln geladen/i)).toBeNull();
  });

  it("respects defaultOpen prop", () => {
    const history: AiStatusMessage[] = [
      {
        stage: "complete",
        message: "Arbeitsblatt erfolgreich generiert",
        timestamp: Date.now(),
      },
    ];

    render(<AiActivityLog history={history} defaultOpen={true} />);
    expect(screen.getByText(/Arbeitsblatt erfolgreich generiert/i)).toBeDefined();
  });
});
