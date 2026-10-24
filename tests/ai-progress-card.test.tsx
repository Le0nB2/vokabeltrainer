import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { AiProgressCard } from "@/components/AiProgressCard";
import { AiStatusMessage } from "@/lib/services/ai-status";

describe("AiProgressCard component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders initial state with title and default message", () => {
    render(
      <AiProgressCard
        title="Arbeitsblatt wird erstellt"
        currentStatus={{
          stage: "init",
          message: "Vokabeln werden vorbereitet...",
          timestamp: Date.now(),
        }}
        statusHistory={[]}
      />
    );

    expect(screen.getByText("Arbeitsblatt wird erstellt")).toBeDefined();
    expect(screen.getByText("Vokabeln werden vorbereitet...")).toBeDefined();
  });

  it("renders retrying stage with 503 warning and countdown", () => {
    const status: AiStatusMessage = {
      stage: "retrying",
      message: "Modell gemini-2.5-flash ist überlastet. Neuer Versuch in 3 Sekunden (Versuch 1/3)...",
      model: "gemini-2.5-flash",
      attempt: 1,
      maxAttempts: 3,
      delaySeconds: 3,
      timestamp: Date.now(),
    };

    render(
      <AiProgressCard
        title="Arbeitsblatt wird erstellt"
        currentStatus={status}
        statusHistory={[status]}
      />
    );

    expect(screen.getByText("Modell vorübergehend überlastet (503)")).toBeDefined();
    expect(screen.getByText("in 3s")).toBeDefined();
    expect(
      screen.getByText("Modell gemini-2.5-flash ist überlastet. Neuer Versuch in 3 Sekunden (Versuch 1/3)...")
    ).toBeDefined();

    // Advance 1s -> should show in 2s
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("in 2s")).toBeDefined();
  });

  it("renders fallback and optimizing stages", () => {
    const fallbackStatus: AiStatusMessage = {
      stage: "fallback",
      message: "Wechsle zum Fallback-Modell gemini-2.0-flash-lite...",
      model: "gemini-2.0-flash-lite",
      timestamp: Date.now(),
    };

    const { rerender } = render(
      <AiProgressCard
        title="Arbeitsblatt wird erstellt"
        currentStatus={fallbackStatus}
        statusHistory={[]}
      />
    );

    expect(screen.getByText("Wechsle zum Fallback-Modell")).toBeDefined();

    const optStatus: AiStatusMessage = {
      stage: "optimizing",
      message: "Optimiere Drucklayout für maximal 4 Seiten...",
      timestamp: Date.now(),
    };

    rerender(
      <AiProgressCard
        title="Arbeitsblatt wird erstellt"
        currentStatus={optStatus}
        statusHistory={[]}
      />
    );

    expect(screen.getByText("Druck-Optimierung")).toBeDefined();
    expect(screen.getByText("Optimiere Drucklayout für maximal 4 Seiten...")).toBeDefined();
  });
});
