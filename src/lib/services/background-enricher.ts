import prisma from "@/lib/prisma";
import { enrichCards, QuotaExceededError } from "@/lib/services/ai-enrichment";

let isWorkerRunning = false;

export function isBackgroundWorkerActive(): boolean {
  return isWorkerRunning;
}

export interface BackgroundEnrichmentResult {
  processed: number;
  success: boolean;
  reason?: string;
}

/**
 * Führt die Hintergrund-Anreicherung von offenen Karten mit PENDING oder DAILY_QUOTA_REACHED durch.
 * Wenn waitInitial true ist (z. B. nach direktem 429-Fehler), wird zuerst 60s gewartet.
 */
export async function runBackgroundEnrichment(options?: {
  waitInitial?: boolean;
  includeDailyQuotaReached?: boolean;
}): Promise<BackgroundEnrichmentResult> {
  if (isWorkerRunning) {
    console.log("[BackgroundWorker] Läuft bereits. Neuer Aufruf wird übersprungen.");
    return { processed: 0, success: true, reason: "already_running" };
  }

  isWorkerRunning = true;
  console.log("[BackgroundWorker] Hintergrund-Worker gestartet.");

  try {
    if (options?.waitInitial) {
      console.log("[BackgroundWorker] Warte 60 Sekunden vor Beginn der Hintergrund-Anreicherung...");
      await new Promise((resolve) => setTimeout(resolve, 60000));
    }

    const targetStatuses = options?.includeDailyQuotaReached
      ? ["PENDING", "DAILY_QUOTA_REACHED"]
      : ["PENDING"];

    let totalProcessed = 0;
    const batchSize = 20;

    while (true) {
      const pendingCards = await prisma.card.findMany({
        where: {
          enrichmentStatus: { in: targetStatuses },
        },
        take: batchSize,
        orderBy: { createdAt: "asc" },
      });

      if (pendingCards.length === 0) {
        console.log(`[BackgroundWorker] Keine offenen Karten mehr vorhanden. Insgesamt verarbeitet: ${totalProcessed}`);
        break;
      }

      console.log(`[BackgroundWorker] Verarbeite Batch von ${pendingCards.length} Karten...`);

      const cardsForEnrichment = pendingCards.map((c) => ({
        id: c.id,
        front: c.front,
        back: c.back,
      }));

      try {
        const enrichedCards = await enrichCards(cardsForEnrichment);

        for (const enriched of enrichedCards) {
          await prisma.card.update({
            where: { id: enriched.id },
            data: {
              ...(enriched.gapText && { gapText: enriched.gapText }),
              ...(enriched.mnemonic && { mnemonic: enriched.mnemonic }),
              ...(enriched.contextSentence && { contextSentence: enriched.contextSentence }),
              enrichmentStatus: "DONE",
            },
          });
        }

        totalProcessed += enrichedCards.length;
        console.log(`[BackgroundWorker] ${enrichedCards.length} Karten in diesem Batch erfolgreich angereichert.`);
      } catch (error: unknown) {
        const isQuota =
          error instanceof QuotaExceededError ||
          (error instanceof Error && error.message.toLowerCase().includes("quota")) ||
          (error as any)?.status === 429;

        if (isQuota) {
          console.warn("[BackgroundWorker] Kontingent aller Schlüssel weiterhin erschöpft (429).");
          // Markiere verbleibende offene Karten mit DAILY_QUOTA_REACHED
          const cardIds = pendingCards.map((c) => c.id);
          await prisma.card.updateMany({
            where: { id: { in: cardIds } },
            data: { enrichmentStatus: "DAILY_QUOTA_REACHED" },
          });

          return {
            processed: totalProcessed,
            success: false,
            reason: "DAILY_QUOTA_REACHED",
          };
        }

        console.error("[BackgroundWorker] Unerwarteter Fehler bei Batch-Anreicherung:", error);
        // Beende aktuellen Lauf bei schweren Fehlern
        break;
      }
    }

    return { processed: totalProcessed, success: true };
  } finally {
    isWorkerRunning = false;
    console.log("[BackgroundWorker] Hintergrund-Worker beendet.");
  }
}

/**
 * Startet den Hintergrund-Worker asynchron (ohne den Aufrufer zu blockieren).
 */
export function triggerBackgroundEnrichment(options?: {
  waitInitial?: boolean;
  includeDailyQuotaReached?: boolean;
}) {
  runBackgroundEnrichment(options).catch((err) => {
    console.error("[BackgroundWorker] Unbehandelter Fehler im Worker-Prozess:", err);
  });
}
