/**
 * Default backoff retry delays for OpenAI and OpenRouter requests (in ms):
 * 1st retry: 2 seconds (2000 ms)
 * 2nd retry: 5 seconds (5000 ms)
 */
export const DEFAULT_AI_RETRY_DELAYS_MS = [2000, 5000]

export const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504])

export interface FetchWithRetryOptions {
  maxAttempts?: number
  delaysMs?: number[]
  providerName?: string
  onRetry?: (attempt: number, delayMs: number, status?: number, error?: unknown) => void
}

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_HTTP_STATUSES.has(status)
}

export function getDefaultRetryDelays(): number[] {
  if (process.env.NODE_ENV === "test") {
    return [0, 0]
  }
  return DEFAULT_AI_RETRY_DELAYS_MS
}

/**
 * Parses the Retry-After header if present (supports integer seconds or HTTP-date).
 * Returns delay in milliseconds or undefined.
 */
export function parseRetryAfterHeader(headerValue: string | null | undefined): number | undefined {
  if (!headerValue) return undefined
  const seconds = Number(headerValue)
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 15000)
  }
  const dateMs = Date.parse(headerValue)
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now()
    if (diff > 0) {
      return Math.min(diff, 15000)
    }
  }
  return undefined
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Executes a fetch request with automatic retries for transient errors
 * (HTTP 429 rate limits, 502/503/504 server overload / gateway errors, network timeouts).
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? 3
  const delays = options.delaysMs ?? getDefaultRetryDelays()
  let lastResponse: Response | null = null
  let lastError: unknown = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(url, init)

      if (response.ok) {
        return response
      }

      lastResponse = response

      // Non-retryable status codes (e.g. 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404)
      if (!isRetryableStatus(response.status)) {
        return response
      }

      // If it is the last attempt, return response so caller can handle / throw appropriate error
      if (attempt === maxAttempts - 1) {
        return response
      }

      const retryAfterMs = parseRetryAfterHeader(response.headers?.get?.("retry-after"))
      const delayMs = retryAfterMs ?? delays[attempt] ?? 5000

      if (options.onRetry) {
        options.onRetry(attempt + 1, delayMs, response.status)
      }

      if (delayMs > 0) {
        await sleep(delayMs)
      }
    } catch (err) {
      lastError = err

      // If last attempt, rethrow error
      if (attempt === maxAttempts - 1) {
        throw err
      }

      const delayMs = delays[attempt] ?? 5000

      if (options.onRetry) {
        options.onRetry(attempt + 1, delayMs, undefined, err)
      }

      if (delayMs > 0) {
        await sleep(delayMs)
      }
    }
  }

  if (lastResponse) return lastResponse
  throw lastError ?? new Error(`Request failed after ${maxAttempts} attempts`)
}
