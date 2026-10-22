import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AUTH_COOKIE_NAME, createAppSessionToken, getAppSecret } from "@/lib/auth-utils";

class MockFormData {
  private data: Record<string, any> = {};
  constructor(entries?: Record<string, any>) {
    if (entries) this.data = entries;
  }
  get(key: string) {
    return this.data[key] ?? null;
  }
}

class MockNextRequest {
  public headers: Headers;
  private formDataObj: MockFormData;

  constructor(formData: MockFormData, headers = new Headers()) {
    this.formDataObj = formData;
    this.headers = headers;
  }

  async formData() {
    return this.formDataObj;
  }
}

describe("POST /api/scan-image (AUDIT-01 & AUDIT-02)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AUTH_USER;
    delete process.env.AUTH_PASSWORD;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEYS;
    if (globalThis.__mockCookies) {
      globalThis.__mockCookies.clear();
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return 401 when auth is configured and user is not logged in", async () => {
    process.env.AUTH_USER = "admin";
    process.env.AUTH_PASSWORD = "secretpassword";

    const { POST } = await import("@/app/api/scan-image/route");
    const req = new MockNextRequest(new MockFormData()) as any;

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Nicht autorisiert");
  });

  it("should return 400 if no image is provided", async () => {
    const { POST } = await import("@/app/api/scan-image/route");
    const req = new MockNextRequest(new MockFormData()) as any;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("No image provided");
  });

  it("should return 400 if image exceeds 10 MB limit", async () => {
    const { POST } = await import("@/app/api/scan-image/route");
    const mockBigFile = {
      size: 11 * 1024 * 1024,
      type: "image/jpeg",
    };
    const req = new MockNextRequest(new MockFormData({ image: mockBigFile })) as any;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("maximal 10 MB");
  });

  it("should return 400 for invalid MIME type", async () => {
    const { POST } = await import("@/app/api/scan-image/route");
    const mockFile = {
      size: 1000,
      type: "application/pdf",
    };
    const req = new MockNextRequest(new MockFormData({ image: mockFile })) as any;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Ungültiger Dateityp");
  });

  it("should enforce rate limiting after 5 requests from same IP (AUDIT-02)", async () => {
    const { POST } = await import("@/app/api/scan-image/route");
    const mockFile = {
      size: 1000,
      type: "image/jpeg",
      arrayBuffer: async () => new ArrayBuffer(8),
    };
    const headers = new Headers({ "x-real-ip": "198.51.100.55" });
    const req = new MockNextRequest(new MockFormData({ image: mockFile }), headers) as any;

    // Simulate 5 requests (which will fail with missing GEMINI_API_KEYS if env not set, but rate limit counts them)
    for (let i = 0; i < 5; i++) {
      await POST(req);
    }

    // 6th request must be blocked with 429
    const resBlocked = await POST(req);
    expect(resBlocked.status).toBe(429);
    const data = await resBlocked.json();
    expect(data.error).toContain("Zu viele Anfragen zur Bildanalyse");
  });
});
