import { describe, it, expect, vi } from "vitest";

// A mock NextRequest object since we are outside Next.js runtime.
class MockNextRequest {
  private body: any;
  constructor(body: any) {
    this.body = body;
  }
  async json() {
    return this.body;
  }
}

// We mock the service that does the actual work to focus on input validation.
vi.mock("@/lib/services/ai-enrichment", () => ({
  enrichCards: vi.fn().mockResolvedValue([]),
  QuotaExceededError: class QuotaExceededError extends Error {}
}));

describe("POST /api/enrich-csv", () => {
  it("should return 400 for invalid card schema (missing front/back)", async () => {
    const { POST } = await import("@/app/api/enrich-csv/route");
    const req = new MockNextRequest({
      cards: [{ id: "1", front: "test" }] // missing back
    }) as any;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid input");
  });

  it("should return 400 for empty cards array", async () => {
    const { POST } = await import("@/app/api/enrich-csv/route");
    const req = new MockNextRequest({
      cards: []
    }) as any;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid input");
  });

  it("should continue with 500 when keys are missing", async () => {
    const { POST } = await import("@/app/api/enrich-csv/route");
    const req = new MockNextRequest({
      cards: [{ id: "1", front: "test", back: "test" }]
    }) as any;

    // Remove env var
    delete process.env.GEMINI_API_KEYS;
    delete process.env.GEMINI_API_KEY;

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("GEMINI_API_KEYS is not configured");
  });

  it("should return 400 when cards array exceeds 50 items (SEC-06)", async () => {
    const { POST } = await import("@/app/api/enrich-csv/route");
    const cards = Array.from({ length: 51 }, (_, i) => ({
      id: `card-${i}`,
      front: `front-${i}`,
      back: `back-${i}`
    }));
    const req = new MockNextRequest({ cards }) as any;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid input");
  });

  it("should return 400 when front or back exceeds 500 characters (SEC-06)", async () => {
    const { POST } = await import("@/app/api/enrich-csv/route");
    const req = new MockNextRequest({
      cards: [{ id: "1", front: "a".repeat(501), back: "test" }]
    }) as any;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid input");
  });

  it("should return 400 when id exceeds 100 characters (SEC-06)", async () => {
    const { POST } = await import("@/app/api/enrich-csv/route");
    const req = new MockNextRequest({
      cards: [{ id: "i".repeat(101), front: "test", back: "test" }]
    }) as any;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid input");
  });
});
