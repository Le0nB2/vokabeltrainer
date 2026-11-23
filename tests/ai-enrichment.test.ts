import { describe, it, expect, vi, beforeEach } from "vitest";
import { enrichCards } from "@/lib/services/ai-enrichment";

const mockGenerateStructuredJson = vi.fn();

vi.mock("@/lib/ai/ai-router", () => ({
  getActiveAiProvider: vi.fn().mockResolvedValue({
    provider: {
      generateStructuredJson: (...args: any[]) => mockGenerateStructuredJson(...args),
    },
  }),
}));

vi.mock("@/lib/ai/providers/gemini-provider", () => {
  return {
    GeminiProvider: class {
      generateStructuredJson(...args: any[]) {
        return mockGenerateStructuredJson(...args);
      }
    },
  };
});

describe("enrichCards service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes prompt with mnemonic rules, keyword method instructions and few-shot examples", async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce([
      {
        id: "1",
        mnemonic: "Klingt wie 'Wehr'...",
        contextSentence: "Where are you going?",
        gapText: "___ are you going?",
      },
    ]);

    const cards = [{ id: "1", front: "where", back: "wo" }];
    const result = await enrichCards(cards, ["test-api-key"]);

    expect(mockGenerateStructuredJson).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateStructuredJson.mock.calls[0][0];
    expect(callArgs.prompt).toContain("Schlüsselwortmethode (Keyword Method)");
    expect(callArgs.prompt).toContain("KLANGWORT (Schlüsselwort)");
    expect(callArgs.prompt).toContain("BILDHAFTE SZENE");
    expect(callArgs.prompt).toContain("STRENG VERBOTEN");
    expect(callArgs.prompt).toContain("where (wo / wohin)");
    expect(callArgs.prompt).toContain("listen (zuhören)");
    expect(result[0].gapText).toBe("___ are you going?");
  });

  it("determines gapText deterministically from contextSentence if gapText is missing", async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce([
      {
        id: "c1",
        mnemonic: "Klingt wie...",
        contextSentence: "Now is the time to start.",
        gapText: null,
      },
    ]);

    const cards = [{ id: "c1", front: "now", back: "jetzt" }];
    const result = await enrichCards(cards);

    expect(result[0].gapText).toBe("___ is the time to start.");
  });

  it("determines gapText if model forgot ___ and left target word or brackets", async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce([
      {
        id: "c2",
        mnemonic: "Klingt wie...",
        contextSentence: "She arrived at the station.",
        gapText: "She arrived at the station.", // model forgot ___
      },
    ]);

    const cards = [{ id: "c2", front: "at", back: "an / bei" }];
    const result = await enrichCards(cards);

    expect(result[0].gapText).toBe("She arrived ___ the station.");
  });

  it("normalizes brackets around ___ such as [___] or (___)", async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce([
      {
        id: "c3",
        mnemonic: "Klingt wie...",
        contextSentence: "I ride my bike to school.",
        gapText: "I ride my [___] to school.",
      },
    ]);

    const cards = [{ id: "c3", front: "bike", back: "Fahrrad" }];
    const result = await enrichCards(cards);

    expect(result[0].gapText).toBe("I ride my ___ to school.");
  });

  it("strips 'to ' prefix from verb when replacing in contextSentence", async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce([
      {
        id: "c4",
        mnemonic: "Klingt wie Listen...",
        contextSentence: "Please listen to the teacher.",
        gapText: undefined,
      },
    ]);

    const cards = [{ id: "c4", front: "to listen", back: "zuhören" }];
    const result = await enrichCards(cards);

    expect(result[0].gapText).toBe("Please ___ to the teacher.");
  });

  it("returns null if gapText is just '___' and contextSentence is missing", async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce([
      {
        id: "c5",
        mnemonic: "Klingt wie...",
        contextSentence: "",
        gapText: "___",
      },
    ]);

    const cards = [{ id: "c5", front: "hello", back: "hallo" }];
    const result = await enrichCards(cards);

    expect(result[0].gapText).toBeNull();
  });
});
