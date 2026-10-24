export type AiStage =
  | "init"
  | "generating"
  | "retrying"
  | "fallback"
  | "key_switch"
  | "optimizing"
  | "complete"
  | "error";

export interface AiStatusMessage {
  stage: AiStage;
  message: string;
  model?: string;
  attempt?: number;
  maxAttempts?: number;
  delaySeconds?: number;
  timestamp: number;
  data?: any;
  error?: string;
}

const encoder = new TextEncoder();

/**
 * Formats a message as a Server-Sent Event (SSE) block.
 */
export function formatSseEvent(eventType: string, data: Record<string, any>): Uint8Array {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  return encoder.encode(payload);
}

/**
 * Consumes an SSE stream from a Response object and calls onStatus for each status event.
 * Resolves with the final result once "complete" event is received.
 */
export async function readAiStatusStream<T = any>(
  response: Response,
  onStatus: (status: AiStatusMessage) => void
): Promise<T> {
  if (!response.body) {
    throw new Error("Antwort enthält keinen Datenstrom.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: T | null = null;
  let encounteredError: Error | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const rawEvent of events) {
      if (!rawEvent.trim()) continue;
      const lines = rawEvent.split("\n");
      let eventType = "message";
      let dataStr = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          dataStr = line.slice(6).trim();
        }
      }

      if (dataStr) {
        try {
          const parsed = JSON.parse(dataStr);
          if (eventType === "status" || parsed.stage) {
            onStatus(parsed);
          }
          if (eventType === "complete" || parsed.stage === "complete") {
            finalResult = parsed.data || parsed;
          }
          if (eventType === "error" || parsed.stage === "error") {
            encounteredError = new Error(parsed.error || "Fehler bei der KI-Verarbeitung");
          }
        } catch (parseErr) {
          if (eventType === "error") {
            encounteredError = parseErr instanceof Error ? parseErr : new Error(String(parseErr));
          } else {
            console.warn("Konnte SSE-Event nicht parsen:", dataStr, parseErr);
          }
        }
      }
    }

    if (encounteredError) {
      throw encounteredError;
    }
  }

  // Handle remaining buffer if any
  if (buffer.trim()) {
    const lines = buffer.split("\n");
    let eventType = "message";
    let dataStr = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) eventType = line.slice(7).trim();
      else if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
    }
    if (dataStr) {
      try {
        const parsed = JSON.parse(dataStr);
        if (eventType === "status" || parsed.stage) onStatus(parsed);
        if (eventType === "complete" || parsed.stage === "complete") finalResult = parsed.data || parsed;
        if (eventType === "error" || parsed.stage === "error") {
          throw new Error(parsed.error || "Fehler");
        }
      } catch (e) {
        if (eventType === "error" || e instanceof Error) throw e;
      }
    }
  }

  if (encounteredError) {
    throw encounteredError;
  }

  if (!finalResult) {
    throw new Error("Datenstrom vorzeitig beendet ohne Ergebnis.");
  }

  return finalResult;
}
