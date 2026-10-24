import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetAllRateLimits } from "@/lib/rate-limit";
import prisma from "@/lib/prisma";
import * as geminiExecutor from "@/lib/services/gemini-executor";
import * as pdfHelper from "@/lib/utils/pdf-helper";
import { readAiStatusStream, AiStatusMessage } from "@/lib/services/ai-status";

// Mock NextRequest outside next runtime
class MockNextRequest {
  private body: any;
  public headers: Headers;

  constructor(body: any, headersObj?: Record<string, string>) {
    this.body = body;
    this.headers = new Headers(headersObj || { "x-forwarded-for": "198.51.100.42" });
  }

  async json() {
    return this.body;
  }
}

describe("POST /api/worksheet (SEC-06)", () => {
  beforeEach(() => {
    resetAllRateLimits();
    vi.restoreAllMocks();
    process.env.GEMINI_API_KEYS = "test-key-1";
  });

  it("returns 400 for empty or missing deckId", async () => {
    const { POST } = await import("@/app/api/worksheet/route");
    const req = new MockNextRequest({ deckId: "" }) as any;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request body");
  });

  it("returns 400 when deckId exceeds 100 characters", async () => {
    const { POST } = await import("@/app/api/worksheet/route");
    const req = new MockNextRequest({ deckId: "x".repeat(101) }) as any;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request body");
  });

  it("blocks with 429 when rate limit of 3 requests/minute per IP is exceeded", async () => {
    const { POST } = await import("@/app/api/worksheet/route");
    const clientHeaders = { "x-forwarded-for": "203.0.113.88" };

    // First 3 requests get past the rate limiter (they fail with 400 because body is invalid, but rate limiter consumed)
    const req1 = new MockNextRequest({ deckId: "" }, clientHeaders) as any;
    const req2 = new MockNextRequest({ deckId: "" }, clientHeaders) as any;
    const req3 = new MockNextRequest({ deckId: "" }, clientHeaders) as any;

    await POST(req1);
    await POST(req2);
    await POST(req3);

    // 4th request from same IP is blocked by rate limiter with 429
    const req4 = new MockNextRequest({ deckId: "valid-deck-id" }, clientHeaders) as any;
    const res4 = await POST(req4);
    expect(res4.status).toBe(429);
    const data4 = await res4.json();
    expect(data4.error).toContain("Zu viele Anfragen zur Arbeitsblatt-Erstellung");

    // Different IP is NOT blocked
    const otherIpReq = new MockNextRequest({ deckId: "" }, { "x-forwarded-for": "192.0.2.77" }) as any;
    const otherRes = await POST(otherIpReq);
    expect(otherRes.status).toBe(400); // Past rate limit, rejected by Zod schema
  });

  it("streams status messages and completes successfully when stream: true", async () => {
    const { POST } = await import("@/app/api/worksheet/route");

    // Mock deck with 5 cards
    vi.spyOn(prisma.deck, "findUnique").mockResolvedValueOnce({
      id: "deck-1",
      name: "Englisch Vokabeln",
      cards: [
        { id: "c1", front: "apple", back: "Apfel", dueDate: new Date() },
        { id: "c2", front: "book", back: "Buch", dueDate: new Date() },
        { id: "c3", front: "cat", back: "Katze", dueDate: new Date() },
        { id: "c4", front: "dog", back: "Hund", dueDate: new Date() },
        { id: "c5", front: "elephant", back: "Elefant", dueDate: new Date() },
      ],
    } as any);

    vi.spyOn(prisma.settings, "upsert").mockResolvedValueOnce({
      id: "default",
      worksheetCount: 5,
    } as any);

    vi.spyOn(geminiExecutor, "callGeminiWithRetry").mockImplementationOnce(
      async (opts: any) => {
        // Simulate a retry notification
        await opts.onStatus?.({
          type: "retry",
          message: "Modell überlastet. Neuer Versuch in 3 Sekunden (Versuch 1/3)...",
          model: "gemini-2.5-flash",
          attempt: 1,
          maxAttempts: 3,
          delaySeconds: 3,
        });

        return {
          exercises: { multipleChoice: [] },
          solutions: {},
        };
      }
    );

    vi.spyOn(pdfHelper, "generateOptimizedPdf").mockResolvedValueOnce({
      finalExercises: { multipleChoice: [] },
      finalSolutions: {},
      pageCount: 4,
    } as any);

    const req = new MockNextRequest({ deckId: "deck-1", stream: true }) as any;
    const res = await POST(req);

    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    const statuses: AiStatusMessage[] = [];
    const result = await readAiStatusStream(res, (status) => {
      statuses.push(status);
    });

    expect(statuses.some((s) => s.stage === "init")).toBe(true);
    expect(statuses.some((s) => s.stage === "retrying" && s.delaySeconds === 3)).toBe(true);
    expect(statuses.some((s) => s.stage === "optimizing")).toBe(true);
    expect(result.worksheetId).toBe("A005");
  });
});
