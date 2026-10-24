import { describe, it, expect, vi } from "vitest";
import { formatSseEvent, readAiStatusStream, AiStatusMessage } from "@/lib/services/ai-status";

describe("ai-status streaming helpers", () => {
  it("formats SSE events properly", () => {
    const uint8 = formatSseEvent("status", { stage: "generating", message: "Läuft..." });
    const text = new TextDecoder().decode(uint8);
    expect(text).toBe('event: status\ndata: {"stage":"generating","message":"Läuft..."}\n\n');
  });

  it("reads stream chunks and notifies onStatus then resolves complete", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(formatSseEvent("status", { stage: "init", message: "Start", timestamp: 1 }));
        controller.enqueue(
          formatSseEvent("status", { stage: "retrying", message: "Überlastet", delaySeconds: 3, timestamp: 2 })
        );
        controller.enqueue(
          formatSseEvent("complete", { stage: "complete", data: { worksheetId: "A001" }, timestamp: 3 })
        );
        controller.close();
      },
    });

    const response = new Response(stream);
    const statuses: AiStatusMessage[] = [];

    const result = await readAiStatusStream(response, (status) => {
      statuses.push(status);
    });

    expect(statuses).toHaveLength(3);
    expect(statuses[0].stage).toBe("init");
    expect(statuses[1].stage).toBe("retrying");
    expect(statuses[2].stage).toBe("complete");
    expect(result).toEqual({ worksheetId: "A001" });
  });

  it("throws error when error event is received in stream", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(formatSseEvent("error", { error: "Modell abgelehnt" }));
        controller.close();
      },
    });

    const response = new Response(stream);
    await expect(readAiStatusStream(response, () => {})).rejects.toThrow("Modell abgelehnt");
  });
});
