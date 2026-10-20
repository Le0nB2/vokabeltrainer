export interface RateLimiterOptions {
  maxAttempts?: number
  windowMs?: number
  blockDurationMs?: number
}

interface RateLimitEntry {
  timestamps: number[]
  blockedUntil?: number
}

const DEFAULT_MAX_ATTEMPTS = 5
const DEFAULT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const DEFAULT_BLOCK_DURATION_MS = 15 * 60 * 1000 // 15 minutes
const MAX_STORE_ENTRIES = 5000

declare const globalThis: {
  __rateLimiterStore?: Map<string, RateLimitEntry>
} & typeof global

function getStore(): Map<string, RateLimitEntry> {
  if (!globalThis.__rateLimiterStore) {
    globalThis.__rateLimiterStore = new Map<string, RateLimitEntry>()
  }
  return globalThis.__rateLimiterStore
}

export class RateLimiter {
  private store: Map<string, RateLimitEntry>
  private defaultMaxAttempts: number
  private defaultWindowMs: number
  private defaultBlockDurationMs: number

  constructor(options?: RateLimiterOptions, store = getStore()) {
    this.store = store
    this.defaultMaxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    this.defaultWindowMs = options?.windowMs ?? DEFAULT_WINDOW_MS
    this.defaultBlockDurationMs = options?.blockDurationMs ?? DEFAULT_BLOCK_DURATION_MS
  }

  private cleanOldEntries(entry: RateLimitEntry, now: number, windowMs: number) {
    entry.timestamps = entry.timestamps.filter((ts) => ts > now - windowMs)
  }

  /**
   * Prune expired entries to prevent memory leaks from unbounded IP storage.
   */
  public prune(now = Date.now()): void {
    for (const [key, entry] of this.store.entries()) {
      this.cleanOldEntries(entry, now, this.defaultWindowMs)
      if (entry.timestamps.length === 0 && (!entry.blockedUntil || entry.blockedUntil <= now)) {
        this.store.delete(key)
      }
    }
  }

  private ensureStoreBounds(now: number): void {
    if (this.store.size > MAX_STORE_ENTRIES) {
      this.prune(now)
      // If still over capacity after pruning expired items, drop the oldest 20% of entries
      if (this.store.size > MAX_STORE_ENTRIES) {
        const toRemove = Math.floor(this.store.size * 0.2)
        let removed = 0
        for (const key of this.store.keys()) {
          this.store.delete(key)
          removed++
          if (removed >= toRemove) break
        }
      }
    }
  }

  check(
    key: string,
    options?: RateLimiterOptions
  ): { isBlocked: boolean; retryAfterSeconds: number; remainingAttempts: number } {
    const maxAttempts = options?.maxAttempts ?? this.defaultMaxAttempts
    const windowMs = options?.windowMs ?? this.defaultWindowMs
    const blockDurationMs = options?.blockDurationMs ?? this.defaultBlockDurationMs
    const now = Date.now()

    const entry = this.store.get(key)
    if (!entry) {
      return { isBlocked: false, retryAfterSeconds: 0, remainingAttempts: maxAttempts }
    }

    if (entry.blockedUntil && now < entry.blockedUntil) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000))
      return { isBlocked: true, retryAfterSeconds, remainingAttempts: 0 }
    }

    // Unblock if block time passed
    if (entry.blockedUntil && now >= entry.blockedUntil) {
      delete entry.blockedUntil
    }

    this.cleanOldEntries(entry, now, windowMs)

    // Clean up empty entry from store
    if (entry.timestamps.length === 0 && !entry.blockedUntil) {
      this.store.delete(key)
      return { isBlocked: false, retryAfterSeconds: 0, remainingAttempts: maxAttempts }
    }

    if (entry.timestamps.length >= maxAttempts) {
      entry.blockedUntil = now + blockDurationMs
      const retryAfterSeconds = Math.max(1, Math.ceil(blockDurationMs / 1000))
      return { isBlocked: true, retryAfterSeconds, remainingAttempts: 0 }
    }

    const remainingAttempts = Math.max(0, maxAttempts - entry.timestamps.length)
    return { isBlocked: false, retryAfterSeconds: 0, remainingAttempts }
  }

  recordFailure(
    key: string,
    options?: RateLimiterOptions
  ): { isBlocked: boolean; retryAfterSeconds: number; remainingAttempts: number } {
    const maxAttempts = options?.maxAttempts ?? this.defaultMaxAttempts
    const windowMs = options?.windowMs ?? this.defaultWindowMs
    const blockDurationMs = options?.blockDurationMs ?? this.defaultBlockDurationMs
    const now = Date.now()

    this.ensureStoreBounds(now)

    let entry = this.store.get(key)
    if (!entry) {
      entry = { timestamps: [] }
      this.store.set(key, entry)
    }

    this.cleanOldEntries(entry, now, windowMs)
    entry.timestamps.push(now)

    if (entry.timestamps.length >= maxAttempts) {
      entry.blockedUntil = now + blockDurationMs
      const retryAfterSeconds = Math.max(1, Math.ceil(blockDurationMs / 1000))
      return { isBlocked: true, retryAfterSeconds, remainingAttempts: 0 }
    }

    const remainingAttempts = Math.max(0, maxAttempts - entry.timestamps.length)
    return { isBlocked: false, retryAfterSeconds: 0, remainingAttempts }
  }

  consume(
    key: string,
    options?: RateLimiterOptions
  ): { isBlocked: boolean; retryAfterSeconds: number; remainingAttempts: number } {
    const maxAttempts = options?.maxAttempts ?? this.defaultMaxAttempts
    const windowMs = options?.windowMs ?? this.defaultWindowMs
    const blockDurationMs = options?.blockDurationMs ?? this.defaultBlockDurationMs
    const now = Date.now()

    this.ensureStoreBounds(now)

    let entry = this.store.get(key)
    if (!entry) {
      entry = { timestamps: [] }
      this.store.set(key, entry)
    }

    if (entry.blockedUntil && now < entry.blockedUntil) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000))
      return { isBlocked: true, retryAfterSeconds, remainingAttempts: 0 }
    }

    if (entry.blockedUntil && now >= entry.blockedUntil) {
      delete entry.blockedUntil
    }

    this.cleanOldEntries(entry, now, windowMs)

    if (entry.timestamps.length >= maxAttempts) {
      entry.blockedUntil = now + blockDurationMs
      const retryAfterSeconds = Math.max(1, Math.ceil(blockDurationMs / 1000))
      return { isBlocked: true, retryAfterSeconds, remainingAttempts: 0 }
    }

    entry.timestamps.push(now)
    const remainingAttempts = Math.max(0, maxAttempts - entry.timestamps.length)
    return { isBlocked: false, retryAfterSeconds: 0, remainingAttempts }
  }

  reset(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  size(): number {
    return this.store.size
  }
}

export const defaultRateLimiter = new RateLimiter()

export function checkRateLimit(key: string, options?: RateLimiterOptions) {
  return defaultRateLimiter.check(key, options)
}

export function recordRateLimitFailure(key: string, options?: RateLimiterOptions) {
  return defaultRateLimiter.recordFailure(key, options)
}

export function consumeRateLimit(key: string, options?: RateLimiterOptions) {
  return defaultRateLimiter.consume(key, options)
}

export function resetRateLimit(key: string) {
  defaultRateLimiter.reset(key)
}

export function resetAllRateLimits() {
  defaultRateLimiter.clear()
}

function sanitizeIp(ip: string): string {
  const cleaned = ip.replace(/:[0-9]+$/, "").trim()
  if (cleaned.length > 45 || !/^[0-9a-fA-F:.]+$/.test(cleaned)) {
    return "127.0.0.1"
  }
  return cleaned
}

export function getClientIpFromHeaders(headersObj?: { get(name: string): string | null }): string {
  try {
    if (!headersObj) return "127.0.0.1"

    // 1. Prioritize trusted reverse proxy headers that cannot be arbitrarily forged by client
    const cfConnectingIp = headersObj.get("cf-connecting-ip")?.trim()
    if (cfConnectingIp) {
      return sanitizeIp(cfConnectingIp)
    }

    const realIp = headersObj.get("x-real-ip")?.trim()
    if (realIp) {
      return sanitizeIp(realIp)
    }

    // 2. Fall back to X-Forwarded-For
    const forwardedFor = headersObj.get("x-forwarded-for")
    if (forwardedFor) {
      const first = forwardedFor.split(",")[0].trim()
      if (first) return sanitizeIp(first)
    }
  } catch {
    // fallback
  }
  return "127.0.0.1"
}

export function formatRetryDuration(seconds: number): string {
  if (seconds <= 1) {
    return "1 Sekunde"
  }
  if (seconds < 60) {
    return `${seconds} Sekunden`
  }
  const minutes = Math.ceil(seconds / 60)
  return minutes === 1 ? "1 Minute" : `${minutes} Minuten`
}
