import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/prisma";
import { runBackgroundEnrichment } from "@/lib/services/background-enricher";
import * as aiEnrichment from "@/lib/services/ai-enrichment";

describe("Background Enricher Service", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
  });

  it("should successfully enrich PENDING cards and set status to DONE", async () => {
    // Mock DB cards
    const mockPendingCards = [
      { id: "c1", front: "apple", back: "Apfel", enrichmentStatus: "PENDING" },
      { id: "c2", front: "book", back: "Buch", enrichmentStatus: "PENDING" },
    ];

    vi.spyOn(prisma.card, "findMany").mockResolvedValueOnce(mockPendingCards as any).mockResolvedValueOnce([]);
    const updateSpy = vi.spyOn(prisma.card, "update").mockResolvedValue({} as any);

    // Mock enrichment function returning enriched cards
    vi.spyOn(aiEnrichment, "enrichCards").mockResolvedValueOnce([
      { id: "c1", gapText: "I eat an ___", mnemonic: "Apfel-Brücke", contextSentence: "I eat an apple" },
      { id: "c2", gapText: "Read a ___", mnemonic: "Buch-Brücke", contextSentence: "Read a book" },
    ]);

    const result = await runBackgroundEnrichment({ waitInitial: false });

    expect(result.success).toBe(true);
    expect(result.processed).toBe(2);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: expect.objectContaining({ enrichmentStatus: "DONE" }),
      })
    );
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c2" },
        data: expect.objectContaining({ enrichmentStatus: "DONE" }),
      })
    );
  });

  it("should mark remaining cards as DAILY_QUOTA_REACHED if QuotaExceededError occurs", async () => {
    const mockPendingCards = [
      { id: "c3", front: "desk", back: "Schreibtisch", enrichmentStatus: "PENDING" },
    ];

    vi.spyOn(prisma.card, "findMany").mockResolvedValueOnce(mockPendingCards as any);
    const updateManySpy = vi.spyOn(prisma.card, "updateMany").mockResolvedValue({ count: 1 } as any);

    vi.spyOn(aiEnrichment, "enrichCards").mockRejectedValueOnce(
      new aiEnrichment.QuotaExceededError()
    );

    const result = await runBackgroundEnrichment({ waitInitial: false });

    expect(result.success).toBe(false);
    expect(result.reason).toBe("DAILY_QUOTA_REACHED");
    expect(updateManySpy).toHaveBeenCalledWith({
      where: { id: { in: ["c3"] } },
      data: { enrichmentStatus: "DAILY_QUOTA_REACHED" },
    });
  });

  it("should process DAILY_QUOTA_REACHED cards when includeDailyQuotaReached is true (Startseiten-Trigger)", async () => {
    const mockQuotaCards = [
      { id: "c4", front: "sun", back: "Sonne", enrichmentStatus: "DAILY_QUOTA_REACHED" },
    ];

    vi.spyOn(prisma.card, "findMany").mockResolvedValueOnce(mockQuotaCards as any).mockResolvedValueOnce([]);
    const updateSpy = vi.spyOn(prisma.card, "update").mockResolvedValue({} as any);

    vi.spyOn(aiEnrichment, "enrichCards").mockResolvedValueOnce([
      { id: "c4", gapText: "The ___ shines", mnemonic: "Sonne-Brücke", contextSentence: "The sun shines" },
    ]);

    const result = await runBackgroundEnrichment({ waitInitial: false, includeDailyQuotaReached: true });

    expect(result.success).toBe(true);
    expect(result.processed).toBe(1);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c4" },
        data: expect.objectContaining({ enrichmentStatus: "DONE" }),
      })
    );
  });
});
