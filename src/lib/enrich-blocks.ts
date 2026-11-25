export type BlockStatus = "queued" | "analyzing" | "done" | "background";

export interface AnalysisBlockCard {
  id: string;
  front: string;
  back: string;
}

export interface AnalysisBlock<T extends AnalysisBlockCard = AnalysisBlockCard> {
  index: number;
  startNumber: number;
  endNumber: number;
  cards: T[];
  status: BlockStatus;
}

export interface EnrichedCardPayload {
  id: string;
  gapText?: string | null;
  mnemonic?: string | null;
  contextSentence?: string | null;
}

/**
 * Computes an adaptive block size so small lists stay granular (10 cards per block)
 * while large lists stay safely within /api/enrich-csv's rate limit (10 req / min).
 */
export function computeAdaptiveBlockSize(totalCards: number): number {
  if (totalCards <= 40) return 10;
  return Math.min(25, Math.max(10, Math.ceil(totalCards / 8)));
}

/**
 * Splits cards into ordered vocabulary blocks for live tracking and batch enrichment.
 */
export function buildAnalysisBlocks<T extends AnalysisBlockCard>(
  cards: T[],
  explicitBlockSize?: number
): AnalysisBlock<T>[] {
  if (!cards || cards.length === 0) return [];
  const blockSize = explicitBlockSize ?? computeAdaptiveBlockSize(cards.length);
  const blocks: AnalysisBlock<T>[] = [];
  for (let i = 0; i < cards.length; i += blockSize) {
    const slice = cards.slice(i, i + blockSize);
    blocks.push({
      index: blocks.length,
      startNumber: i + 1,
      endNumber: i + slice.length,
      cards: slice,
      status: "queued",
    });
  }
  return blocks;
}

export interface EnrichBlocksCallbacks {
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  onBlockStart?: (blockIndex: number) => void;
  onBlockSuccess?: (blockIndex: number, enriched: EnrichedCardPayload[]) => Promise<void> | void;
  onRemainingToBackground?: (
    startBlockIndex: number,
    info: { isQuota: boolean; message: string }
  ) => void;
}

/**
 * Sequentially enriches blocks via POST /api/enrich-csv with per-request timeout protection
 * and automatic background handover on quota exhaustion or transient failures.
 */
export async function runBlockEnrichment<T extends AnalysisBlockCard>(
  blocks: AnalysisBlock<T>[],
  callbacks: EnrichBlocksCallbacks
): Promise<{ completedCount: number; backgroundCount: number; aborted: boolean; hadQuota: boolean }> {
  let completedCount = 0;
  const timeoutMs = callbacks.requestTimeoutMs ?? 60000;

  for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
    if (callbacks.signal?.aborted) {
      return { completedCount, backgroundCount: 0, aborted: true, hadQuota: false };
    }

    const block = blocks[bIdx];
    callbacks.onBlockStart?.(bIdx);

    const blockController = new AbortController();
    const timeoutId = setTimeout(() => blockController.abort(), timeoutMs);
    const onParentAbort = () => blockController.abort();
    callbacks.signal?.addEventListener("abort", onParentAbort, { once: true });

    try {
      const res = await fetch("/api/enrich-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: block.cards.map((c) => ({ id: c.id, front: c.front, back: c.back })),
        }),
        signal: blockController.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const isQuota =
          res.status === 429 || Boolean(data.quotaExhausted) || Boolean(data.backgroundEnrichment);
        const remainingCount = blocks.slice(bIdx).reduce((sum, b) => sum + b.cards.length, 0);
        const message = isQuota
          ? data.error ||
            `Kontingent aller Schlüssel erschöpft. Die restlichen ${remainingCount} Karten werden im Hintergrund vervollständigt.`
          : data.error ||
            `KI-Verarbeitung für Block ${bIdx + 1} unterbrochen. Die restlichen ${remainingCount} Karten werden im Hintergrund vervollständigt.`;

        callbacks.onRemainingToBackground?.(bIdx, { isQuota, message });
        return { completedCount, backgroundCount: remainingCount, aborted: false, hadQuota: isQuota };
      }

      const data = await res.json();
      const enriched: EnrichedCardPayload[] = Array.isArray(data.cards) ? data.cards : [];
      completedCount += block.cards.length;
      await callbacks.onBlockSuccess?.(bIdx, enriched);
    } catch (err: unknown) {
      if (callbacks.signal?.aborted) {
        return { completedCount, backgroundCount: 0, aborted: true, hadQuota: false };
      }
      const isAbortTimeout = (err as Error)?.name === "AbortError";
      const remainingCount = blocks.slice(bIdx).reduce((sum, b) => sum + b.cards.length, 0);
      const message = isAbortTimeout
        ? `Zeitüberschreitung bei Block ${bIdx + 1}. Die restlichen ${remainingCount} Karten werden im Hintergrund vervollständigt.`
        : `Verbindung bei Block ${bIdx + 1} unterbrochen. Die restlichen ${remainingCount} Karten werden im Hintergrund vervollständigt.`;

      callbacks.onRemainingToBackground?.(bIdx, { isQuota: false, message });
      return { completedCount, backgroundCount: remainingCount, aborted: false, hadQuota: false };
    } finally {
      clearTimeout(timeoutId);
      callbacks.signal?.removeEventListener("abort", onParentAbort);
    }
  }

  return { completedCount, backgroundCount: 0, aborted: false, hadQuota: false };
}
