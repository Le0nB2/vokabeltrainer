import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/prisma";
import {
  getModelHierarchy,
  getStoredAiModels,
  fetchAndPersistGoogleModels,
  isSuitableModel,
  getModelTier,
} from "@/lib/services/ai-models";

describe("ai-models service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("getModelHierarchy", () => {
    it("returns user selected model followed by fallbacks without duplicates", async () => {
      vi.spyOn(prisma.settings, "findUnique").mockResolvedValueOnce({
        id: "default",
        selectedModel: "gemini-3.8-flash",
      } as any);

      const models = await getModelHierarchy();
      expect(models).toEqual([
        "gemini-3.8-flash",
        "gemini-flash-lite-latest",
      ]);
    });

    it("does not duplicate if selectedModel is already a fallback", async () => {
      vi.spyOn(prisma.settings, "findUnique").mockResolvedValueOnce({
        id: "default",
        selectedModel: "gemini-flash-lite-latest",
      } as any);

      const models = await getModelHierarchy();
      expect(models).toEqual([
        "gemini-flash-lite-latest",
      ]);
    });

    it("handles db errors gracefully and returns default fallbacks", async () => {
      vi.spyOn(prisma.settings, "findUnique").mockRejectedValueOnce(
        new Error("DB error")
      );

      const models = await getModelHierarchy();
      expect(models).toEqual([
        "gemini-3.6-flash",
        "gemini-flash-lite-latest",
      ]);
    });
  });

  describe("getStoredAiModels", () => {
    it("returns default fallback list when no models in DB", async () => {
      vi.spyOn(prisma.aiModel, "findMany").mockResolvedValueOnce([]);

      const models = await getStoredAiModels();
      expect(models.length).toBeGreaterThanOrEqual(1);
      expect(models[0].id).toBe("gemini-3.6-flash");
      expect(models[1].id).toBe("gemini-flash-lite-latest");
    });

    it("returns stored models when available in DB", async () => {
      vi.spyOn(prisma.aiModel, "findMany").mockResolvedValueOnce([
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
      vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => {
        return cb(prisma);
      });
      vi.spyOn(prisma.aiModel, "deleteMany").mockResolvedValueOnce({ count: 0 });
      vi.spyOn(prisma.aiModel, "upsert").mockResolvedValue({ id: "gemini-3.5-flash" } as any);
      vi.spyOn(prisma.apiUsageLog, "create").mockResolvedValue({ id: "log-1" } as any);

      const mockAiClient = {
        models: {
          list: async function* () {
            yield {
              name: "models/gemini-3.5-flash",
              displayName: "Gemini 3.5 Flash",
              supportedActions: ["generateContent"],
              description: "Fast model",
            };
            yield {
              name: "models/gemini-3.8-flash-tts",
              displayName: "Gemini 3.8 Flash TTS",
              supportedActions: ["generateContent"],
              description: "TTS model (should be filtered out)",
            };
            yield {
              name: "models/text-embedding-004",
              displayName: "Text Embedding",
              supportedActions: ["embedContent"],
              description: "Embedding (should be filtered out)",
            };
          },
        },
      };

      const res = await fetchAndPersistGoogleModels(mockAiClient);
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
      expect(prisma.apiUsageLog.create).toHaveBeenCalledWith({
        data: {
          apiKeyIndex: 1,
          isSuccess: true,
          endpoint: "models",
        },
      });
    });

    it("logs error to apiUsageLog when client call fails", async () => {
      vi.spyOn(prisma.apiUsageLog, "create").mockResolvedValue({ id: "log-err" } as any);

      const failingAiClient = {
        models: {
          list: async () => {
            throw new Error("Quota exceeded");
          },
        },
      };

      const res = await fetchAndPersistGoogleModels(failingAiClient);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Quota exceeded");
      expect(prisma.apiUsageLog.create).toHaveBeenCalledWith({
        data: {
          apiKeyIndex: 1,
          isSuccess: false,
          endpoint: "models",
        },
      });
    });
  });

  describe("isSuitableModel", () => {
    it("accepts valid active Gemini text & vision models", () => {
      expect(isSuitableModel("gemini-3.5-flash-lite")).toBe(true);
      expect(isSuitableModel("gemini-3.8-flash")).toBe(true);
      expect(isSuitableModel("gemini-3.1-pro-preview")).toBe(true);
      expect(isSuitableModel("gemini-flash-latest")).toBe(true);
    });

    it("rejects non-gemini, deprecated, or specialized models", () => {
      // Deprecated versions
      expect(isSuitableModel("gemini-1.5-flash")).toBe(false);
      expect(isSuitableModel("gemini-2.5-flash")).toBe(false);
      expect(isSuitableModel("gemini-2.5-pro")).toBe(false);
      // Non-gemini
      expect(isSuitableModel("text-embedding-004")).toBe(false);
      expect(isSuitableModel("gemma-4-31b-it")).toBe(false);
      // Specialized non-general LLMs
      expect(isSuitableModel("gemini-3.8-flash-tts")).toBe(false);
      expect(isSuitableModel("gemini-3.1-flash-image")).toBe(false);
      expect(isSuitableModel("gemini-omni-flash-preview")).toBe(false);
      expect(isSuitableModel("gemini-4-argon")).toBe(false);
      expect(isSuitableModel("gemini-nano-banana-2.1")).toBe(false);
      expect(isSuitableModel("gemini-robotics-er-2-preview")).toBe(false);
    });
  });

  describe("getModelTier", () => {
    it("classifies Pro models as paid", () => {
      expect(getModelTier("gemini-3.1-pro-preview")).toBe("paid");
      expect(getModelTier("gemini-pro-latest")).toBe("paid");
      expect(getModelTier("gemini-4-pro")).toBe("paid");
    });

    it("classifies Flash and Flash-Lite models as free tier", () => {
      expect(getModelTier("gemini-3.5-flash-lite")).toBe("free");
      expect(getModelTier("gemini-3.1-flash-lite")).toBe("free");
      expect(getModelTier("gemini-3.8-flash")).toBe("free");
      expect(getModelTier("gemini-flash-latest")).toBe("free");
    });
  });
});
