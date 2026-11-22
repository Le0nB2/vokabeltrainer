import { describe, it, expect } from "vitest";
import {
  getModelTier,
  getHeuristicModelTier,
  isPaidModel,
  isFreeModel,
  KNOWN_PAID_KEYWORDS,
  KNOWN_FREE_KEYWORDS,
} from "@/lib/ai-model-tiers";

describe("ai-model-tiers classification", () => {
  describe("Heuristic & Exact Tier Detection", () => {
    it("recognizes neon models as paid tier", () => {
      expect(getHeuristicModelTier("gemini-4-neon")).toBe("paid");
      expect(getHeuristicModelTier("gemini-neon")).toBe("paid");
      expect(getHeuristicModelTier("models/gemini-4-neon")).toBe("paid");
      expect(getModelTier("gemini-4-neon")).toBe("paid");
      expect(isPaidModel("gemini-4-neon")).toBe(true);
      expect(isFreeModel("gemini-4-neon")).toBe(false);
    });

    it("recognizes carbon, argon, pro, deep-research and ultra models as paid tier", () => {
      const paidModels = [
        "gemini-4-carbon",
        "gemini-4-argon",
        "gemini-3.1-pro-preview",
        "gemini-pro-latest",
        "gemini-4-pro",
        "deep-research",
        "gemini-ultra-1.0",
      ];
      for (const id of paidModels) {
        expect(getHeuristicModelTier(id)).toBe("paid");
        expect(getModelTier(id)).toBe("paid");
        expect(isPaidModel(id)).toBe(true);
        expect(isFreeModel(id)).toBe(false);
      }
    });

    it("recognizes flash and hydrogen models as free tier", () => {
      const freeModels = [
        "gemini-4-hydrogen",
        "gemini-3.8-flash",
        "gemini-3.5-flash-lite",
        "gemini-flash-latest",
        "gemini-flash-lite-latest",
      ];
      for (const id of freeModels) {
        expect(getHeuristicModelTier(id)).toBe("free");
        expect(getModelTier(id)).toBe("free");
        expect(isFreeModel(id)).toBe(true);
        expect(isPaidModel(id)).toBe(false);
      }
    });

    it("handles displayName and descriptions when id alone is ambiguous", () => {
      expect(getHeuristicModelTier("custom-model-id", "Gemini 4 Neon Frontier")).toBe("paid");
      expect(getHeuristicModelTier("custom-model-id", "Gemini Flash Edition")).toBe("free");
    });

    it("returns 'unknown' for completely new models without known keywords, and getModelTier defaults to 'paid'", () => {
      expect(getHeuristicModelTier("gemini-4-xenon")).toBe("unknown");
      expect(getHeuristicModelTier("gemini-5-custom")).toBe("unknown");

      // Safe fallback to paid prevents quota limit 0 surprises for free users
      expect(getModelTier("gemini-4-xenon")).toBe("paid");
      expect(getModelTier("gemini-5-custom")).toBe("paid");

      // Can accept explicit custom fallback tier if probe verified it
      expect(getModelTier("gemini-4-xenon", null, "free")).toBe("free");
    });

    it("prioritizes paid keywords if a model contains both pro and flash-like strings", () => {
      expect(getHeuristicModelTier("gemini-pro-flash")).toBe("paid");
      expect(getModelTier("gemini-pro-flash")).toBe("paid");
    });
  });

  describe("Keyword lists", () => {
    it("contains essential paid keywords including neon", () => {
      expect(KNOWN_PAID_KEYWORDS).toContain("neon");
      expect(KNOWN_PAID_KEYWORDS).toContain("carbon");
      expect(KNOWN_PAID_KEYWORDS).toContain("argon");
      expect(KNOWN_PAID_KEYWORDS).toContain("pro");
    });

    it("contains essential free keywords including flash and hydrogen", () => {
      expect(KNOWN_FREE_KEYWORDS).toContain("flash");
      expect(KNOWN_FREE_KEYWORDS).toContain("hydrogen");
    });
  });
});
