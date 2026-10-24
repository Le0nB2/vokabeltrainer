import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/prisma";
import {
  callGeminiWithRetry,
  getRetryDelayMs,
  DEFAULT_RETRY_DELAYS_MS,
  isOverloadedError,
  isQuotaError,
  QuotaExceededError,
} from "@/lib/services/gemini-executor";

describe("gemini-executor service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma.apiUsageLog, "create").mockResolvedValue({} as any);
  });

  describe("error classifications", () => {
    it("correctly identifies overload errors", () => {
      expect(isOverloadedError(new Error("503 Service Unavailable"))).toBe(true);
      expect(isOverloadedError(new Error("The model is overloaded. Please try again later."))).toBe(true);
      expect(isOverloadedError(new Error("temporarily high demand"))).toBe(true);
      expect(isOverloadedError(new Error("UNAVAILABLE: backend down"))).toBe(true);
      expect(isOverloadedError({ status: 503, message: "Server error" })).toBe(true);

      expect(isOverloadedError(new Error("Invalid argument: bad JSON"))).toBe(false);
      expect(isOverloadedError(new Error("429 Quota exceeded"))).toBe(false);
    });

    it("correctly identifies quota errors", () => {
      expect(isQuotaError(new Error("429 RESOURCE_EXHAUSTED"))).toBe(true);
      expect(isQuotaError(new Error("Quota exceeded for quota metric"))).toBe(true);
      expect(isQuotaError({ status: 429, message: "Too many requests" })).toBe(true);

      expect(isQuotaError(new Error("503 Service Unavailable"))).toBe(false);
      expect(isQuotaError(new Error("Not found"))).toBe(false);
    });
  });

  describe("callGeminiWithRetry", () => {
    it("succeeds on first attempt without retrying", async () => {
      const executeMock = vi.fn().mockResolvedValue("success-result");

      const result = await callGeminiWithRetry({
        endpoint: "test-endpoint",
        apiKeys: ["key-1"],
        models: ["gemini-3.6-flash", "gemini-flash-lite-latest"],
        retryDelayMs: 1, // minimal delay for test speed
        execute: executeMock,
      });

      expect(result).toBe("success-result");
      expect(executeMock).toHaveBeenCalledTimes(1);
      expect(executeMock).toHaveBeenCalledWith(expect.anything(), "gemini-3.6-flash");
      expect(prisma.apiUsageLog.create).toHaveBeenCalledWith({
        data: { apiKeyIndex: 1, isSuccess: true, endpoint: "test-endpoint" },
      });
    });

    it("retries same model when overloaded and succeeds on retry", async () => {
      const executeMock = vi
        .fn()
        .mockRejectedValueOnce(new Error("503 Service Unavailable"))
        .mockResolvedValueOnce("recovered-result");

      const result = await callGeminiWithRetry({
        endpoint: "test-endpoint",
        apiKeys: ["key-1"],
        models: ["gemini-3.6-flash", "gemini-flash-lite-latest"],
        retryDelayMs: 1,
        execute: executeMock,
      });

      expect(result).toBe("recovered-result");
      expect(executeMock).toHaveBeenCalledTimes(2);
      expect(executeMock).toHaveBeenNthCalledWith(1, expect.anything(), "gemini-3.6-flash");
      expect(executeMock).toHaveBeenNthCalledWith(2, expect.anything(), "gemini-3.6-flash");
    });

    it("falls back to fallback model after 3 failed attempts on primary model", async () => {
      const executeMock = vi
        .fn()
        // 3 failures on gemini-3.6-flash
        .mockRejectedValueOnce(new Error("503 Service Unavailable"))
        .mockRejectedValueOnce(new Error("503 The model is overloaded"))
        .mockRejectedValueOnce(new Error("503 High demand"))
        // Success on gemini-flash-lite-latest
        .mockResolvedValueOnce("fallback-success");

      const result = await callGeminiWithRetry({
        endpoint: "test-endpoint",
        apiKeys: ["key-1"],
        models: ["gemini-3.6-flash", "gemini-flash-lite-latest"],
        retryDelayMs: 1,
        execute: executeMock,
      });

      expect(result).toBe("fallback-success");
      expect(executeMock).toHaveBeenCalledTimes(4);
      expect(executeMock).toHaveBeenNthCalledWith(1, expect.anything(), "gemini-3.6-flash");
      expect(executeMock).toHaveBeenNthCalledWith(2, expect.anything(), "gemini-3.6-flash");
      expect(executeMock).toHaveBeenNthCalledWith(3, expect.anything(), "gemini-3.6-flash");
      expect(executeMock).toHaveBeenNthCalledWith(4, expect.anything(), "gemini-flash-lite-latest");
    });

    it("throws when all attempts fail (3x primary model, 1x fallback model)", async () => {
      const executeMock = vi.fn().mockRejectedValue(new Error("503 Service Unavailable"));

      await expect(
        callGeminiWithRetry({
          endpoint: "test-endpoint",
          apiKeys: ["key-1"],
          models: ["gemini-3.6-flash", "gemini-flash-lite-latest"],
          retryDelayMs: 1,
          execute: executeMock,
        })
      ).rejects.toThrow("503 Service Unavailable");

      // 3 attempts on primary model (gemini-3.6-flash) + 1 attempt on fallback model (gemini-flash-lite-latest) = 4 total
      expect(executeMock).toHaveBeenCalledTimes(4);
    });

    it("rotates API key immediately without 3x retrying when quota is exhausted (429)", async () => {
      const executeMock = vi
        .fn()
        // Key 1 exhausts quota
        .mockRejectedValueOnce(new Error("429 RESOURCE_EXHAUSTED Quota exceeded"))
        // Key 2 succeeds
        .mockResolvedValueOnce("key2-success");

      const result = await callGeminiWithRetry({
        endpoint: "test-endpoint",
        apiKeys: ["key-1", "key-2"],
        models: ["gemini-3.6-flash", "gemini-flash-lite-latest"],
        retryDelayMs: 1,
        execute: executeMock,
      });

      expect(result).toBe("key2-success");
      // Key 1 was tried once, failed with 429, immediately jumped to Key 2
      expect(executeMock).toHaveBeenCalledTimes(2);
    });

    it("throws QuotaExceededError when all keys exhaust quota", async () => {
      const executeMock = vi.fn().mockRejectedValue(new Error("429 RESOURCE_EXHAUSTED"));

      await expect(
        callGeminiWithRetry({
          endpoint: "test-endpoint",
          apiKeys: ["key-1", "key-2"],
          models: ["gemini-3.6-flash"],
          retryDelayMs: 1,
          execute: executeMock,
        })
      ).rejects.toThrow(QuotaExceededError);
    });

    it("notifies onStatus callback on start, overload retry, and fallback", async () => {
      const statusEvents: any[] = [];
      const onStatus = vi.fn((event) => {
        statusEvents.push(event);
      });

      const executeMock = vi
        .fn()
        // 3 failures on gemini-3.6-flash
        .mockRejectedValueOnce(new Error("503 Overloaded"))
        .mockRejectedValueOnce(new Error("503 Overloaded"))
        .mockRejectedValueOnce(new Error("503 Overloaded"))
        // Success on gemini-flash-lite-latest
        .mockResolvedValueOnce("success");

      await callGeminiWithRetry({
        endpoint: "test-endpoint",
        apiKeys: ["key-1"],
        models: ["gemini-3.6-flash", "gemini-flash-lite-latest"],
        retryDelayMs: 1,
        execute: executeMock,
        onStatus,
      });

      expect(onStatus).toHaveBeenCalled();
      const retryEvents = statusEvents.filter((e) => e.type === "retry");
      expect(retryEvents).toHaveLength(2); // 2 retries on primary model
      expect(retryEvents[0].attempt).toBe(1);
      expect(retryEvents[0].message).toContain("überlastet");

      const fallbackEvents = statusEvents.filter((e) => e.type === "fallback");
      expect(fallbackEvents).toHaveLength(1);
      expect(fallbackEvents[0].model).toBe("gemini-flash-lite-latest");
    });

    it("uses staged backoff delays (4s on 1st retry, 7s on 2nd retry)", async () => {
      expect(DEFAULT_RETRY_DELAYS_MS).toEqual([4000, 7000]);
      expect(getRetryDelayMs(0)).toBe(4000);
      expect(getRetryDelayMs(1)).toBe(7000);
      expect(getRetryDelayMs(2)).toBe(7000);
      expect(getRetryDelayMs(0, 150)).toBe(150);
      expect(getRetryDelayMs(0, undefined, [2000, 5000])).toBe(2000);
      expect(getRetryDelayMs(1, undefined, [2000, 5000])).toBe(5000);

      const statusEvents: any[] = [];
      const onStatus = vi.fn((event) => {
        statusEvents.push(event);
      });

      const executeMock = vi
        .fn()
        .mockRejectedValueOnce(new Error("503 Overloaded"))
        .mockRejectedValueOnce(new Error("503 Overloaded"))
        .mockResolvedValueOnce("recovered");

      // Pass minimal delays [1, 2] to test staged behavior without slowing down tests
      await callGeminiWithRetry({
        endpoint: "test-endpoint",
        apiKeys: ["key-1"],
        models: ["gemini-3.6-flash"],
        retryDelaysMs: [4000, 7000],
        retryDelayMs: 1, // overrides for execution speed
        execute: executeMock,
        onStatus,
      });

      const retryEvents = statusEvents.filter((e) => e.type === "retry");
      expect(retryEvents).toHaveLength(2);
    });
  });
});
