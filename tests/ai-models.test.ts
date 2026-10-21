import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/prisma";
import {
  getModelHierarchy,
  getStoredAiModels,
  fetchAndPersistGoogleModels,
} from "@/lib/services/ai-models";

const mockList = vi.fn();

vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class {
      models = {
        list: mockList,
      };
    },
  };
});

vi.mock("@/lib/prisma", () => ({
  default: {
    settings: {
      findUnique: vi.fn(),
    },
    aiModel: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(async (cb: any) => cb(prisma)),
  },
}));

describe("ai-models service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getModelHierarchy", () => {
    it("returns user selected model followed by fallbacks without duplicates", async () => {
      vi.mocked(prisma.settings.findUnique).mockResolvedValueOnce({
        id: "default",
        selectedModel: "gemini-3.8-flash",
      } as any);

      const models = await getModelHierarchy();
      expect(models).toEqual([
        "gemini-3.8-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
      ]);
    });

    it("does not duplicate if selectedModel is already a fallback", async () => {
      vi.mocked(prisma.settings.findUnique).mockResolvedValueOnce({
        id: "default",
        selectedModel: "gemini-3.5-flash-lite",
      } as any);

      const models = await getModelHierarchy();
      expect(models).toEqual([
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
      ]);
    });

    it("handles db errors gracefully and returns default fallbacks", async () => {
      vi.mocked(prisma.settings.findUnique).mockRejectedValueOnce(
        new Error("DB error")
      );

      const models = await getModelHierarchy();
      expect(models).toEqual([
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
      ]);
    });
  });

  describe("getStoredAiModels", () => {
    it("returns default fallback list when no models in DB", async () => {
      vi.mocked(prisma.aiModel.findMany).mockResolvedValueOnce([]);

      const models = await getStoredAiModels();
      expect(models.length).toBeGreaterThanOrEqual(1);
      expect(models[0].id).toBe("gemini-3.5-flash-lite");
    });

    it("returns stored models when available in DB", async () => {
      vi.mocked(prisma.aiModel.findMany).mockResolvedValueOnce([
        {
          id: "gemini-3.8-flash",
          name: "models/gemini-3.8-flash",
          displayName: "Gemini 3.8 Flash",
          description: "Schnelles Modell",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const models = await getStoredAiModels();
      expect(models).toEqual([
        {
          id: "gemini-3.8-flash",
          name: "models/gemini-3.8-flash",
          displayName: "Gemini 3.8 Flash",
          description: "Schnelles Modell",
        },
      ]);
    });
  });

  describe("fetchAndPersistGoogleModels", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    it("returns error if no GEMINI_API_KEY is configured", async () => {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEYS;

      const res = await fetchAndPersistGoogleModels();
      expect(res.success).toBe(false);
      expect(res.error).toContain("Kein GEMINI_API_KEY");
    });

    it("fetches, filters, and stores valid Gemini models in database", async () => {
      process.env.GEMINI_API_KEY = "test-api-key";

      mockList.mockResolvedValueOnce([
        {
          name: "models/gemini-3.5-flash",
          displayName: "Gemini 3.5 Flash",
          supportedActions: ["generateContent"],
          description: "Fast model",
        },
        {
          name: "models/gemini-3.8-flash-tts",
          displayName: "Gemini 3.8 Flash TTS",
          supportedActions: ["generateContent"],
          description: "TTS model (should be filtered out)",
        },
        {
          name: "models/text-embedding-004",
          displayName: "Text Embedding",
          supportedActions: ["embedContent"],
          description: "Embedding (should be filtered out)",
        },
      ]);

      const res = await fetchAndPersistGoogleModels();
      expect(res.success).toBe(true);
      expect(res.count).toBe(1);
      expect(prisma.aiModel.deleteMany).toHaveBeenCalled();
      expect(prisma.aiModel.upsert).toHaveBeenCalledWith({
        where: { id: "gemini-3.5-flash" },
        update: {
          name: "models/gemini-3.5-flash",
          displayName: "Gemini 3.5 Flash",
          description: "Fast model",
        },
        create: {
          id: "gemini-3.5-flash",
          name: "models/gemini-3.5-flash",
          displayName: "Gemini 3.5 Flash",
          description: "Fast model",
        },
      });
    });
  });
});
