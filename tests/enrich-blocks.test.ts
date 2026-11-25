import { describe, it, expect, vi, afterEach } from "vitest";
import {
  computeAdaptiveBlockSize,
  buildAnalysisBlocks,
  runBlockEnrichment,
} from "@/lib/enrich-blocks";

describe("enrich-blocks helper", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computes adaptive block size cleanly", () => {
    expect(computeAdaptiveBlockSize(10)).toBe(10);
    expect(computeAdaptiveBlockSize(35)).toBe(10);
    expect(computeAdaptiveBlockSize(100)).toBe(13);
    expect(computeAdaptiveBlockSize(250)).toBe(25);
  });

  it("splits cards into queued analysis blocks with accurate numbering", () => {
    const cards = Array.from({ length: 23 }, (_, i) => ({
      id: `c_${i}`,
      front: `word_${i}`,
      back: `wort_${i}`,
    }));

    const blocks = buildAnalysisBlocks(cards);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ index: 0, startNumber: 1, endNumber: 10, status: "queued" });
    expect(blocks[1]).toMatchObject({ index: 1, startNumber: 11, endNumber: 20, status: "queued" });
    expect(blocks[2]).toMatchObject({ index: 2, startNumber: 21, endNumber: 23, status: "queued" });
  });

  it("enriches blocks sequentially and hands remaining blocks to background on 429", async () => {
    const cards = Array.from({ length: 15 }, (_, i) => ({
      id: `c_${i}`,
      front: `front_${i}`,
      back: `back_${i}`,
    }));
    const blocks = buildAnalysisBlocks(cards, 10);

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cards: cards.slice(0, 10).map((c) => ({
            id: c.id,
            gapText: "___",
            mnemonic: "m",
            contextSentence: c.front,
          })),
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ quotaExhausted: true }),
      } as any);

    const started: number[] = [];
    const succeeded: number[] = [];
    let backgroundStart = -1;

    const outcome = await runBlockEnrichment(blocks, {
      onBlockStart: (idx) => started.push(idx),
      onBlockSuccess: (idx) => {
        succeeded.push(idx);
      },
      onRemainingToBackground: (idx) => {
        backgroundStart = idx;
      },
    });

    expect(started).toEqual([0, 1]);
    expect(succeeded).toEqual([0]);
    expect(backgroundStart).toBe(1);
    expect(outcome.completedCount).toBe(10);
    expect(outcome.backgroundCount).toBe(5);
    expect(outcome.hadQuota).toBe(true);
  });
});
