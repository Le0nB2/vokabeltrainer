import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  fetchWithRetry,
  isRetryableStatus,
  parseRetryAfterHeader,
  DEFAULT_AI_RETRY_DELAYS_MS,
} from "@/lib/ai/fetch-with-retry"

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("recognizes retryable HTTP statuses correctly", () => {
    expect(isRetryableStatus(429)).toBe(true)
    expect(isRetryableStatus(502)).toBe(true)
    expect(isRetryableStatus(503)).toBe(true)
    expect(isRetryableStatus(504)).toBe(true)
    expect(isRetryableStatus(408)).toBe(true)
    expect(isRetryableStatus(500)).toBe(true)

    expect(isRetryableStatus(200)).toBe(false)
    expect(isRetryableStatus(400)).toBe(false)
    expect(isRetryableStatus(401)).toBe(false)
    expect(isRetryableStatus(403)).toBe(false)
    expect(isRetryableStatus(404)).toBe(false)
  })

  it("parses Retry-After header correctly", () => {
    expect(parseRetryAfterHeader(null)).toBeUndefined()
    expect(parseRetryAfterHeader("")).toBeUndefined()
    expect(parseRetryAfterHeader("2")).toBe(2000)
    expect(parseRetryAfterHeader("5")).toBe(5000)
    // Caps at 15000ms
    expect(parseRetryAfterHeader("60")).toBe(15000)
  })

  it("returns response directly on 200 OK without retry", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    })
    global.fetch = mockFetch as any

    const res = await fetchWithRetry("https://example.com/api", {})
    expect(res.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("retries on HTTP 429 and returns successful response on subsequent attempt", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      })
    global.fetch = mockFetch as any

    const res = await fetchWithRetry("https://example.com/api", {}, { delaysMs: [0, 0] })
    expect(res.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it("retries on HTTP 503 and returns successful response on 3rd attempt", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      })
    global.fetch = mockFetch as any

    const res = await fetchWithRetry("https://example.com/api", {}, { delaysMs: [0, 0] })
    expect(res.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it("aborts immediately without retrying on HTTP 401 Unauthorized", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
    })
    global.fetch = mockFetch as any

    const res = await fetchWithRetry("https://example.com/api", {}, { delaysMs: [0, 0] })
    expect(res.status).toBe(401)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("retries on network exceptions (e.g. fetch failure)", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Connection reset"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      })
    global.fetch = mockFetch as any

    const res = await fetchWithRetry("https://example.com/api", {}, { delaysMs: [0, 0] })
    expect(res.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it("rethrows error if network failure persists across all maxAttempts", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network down"))
    global.fetch = mockFetch as any

    await expect(
      fetchWithRetry("https://example.com/api", {}, { maxAttempts: 3, delaysMs: [0, 0] })
    ).rejects.toThrow("Network down")
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it("calls onRetry callback when configured", async () => {
    const onRetry = vi.fn()
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 504,
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      })
    global.fetch = mockFetch as any

    await fetchWithRetry(
      "https://example.com/api",
      {},
      { maxAttempts: 3, delaysMs: [0, 0], onRetry }
    )
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledWith(1, 0, 504)
  })
})
