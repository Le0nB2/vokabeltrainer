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

  reset(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

export const defaultRateLimiter = new RateLimiter()

export function checkRateLimit(key: string, options?: RateLimiterOptions) {
  return defaultRateLimiter.check(key, options)
}

export function recordRateLimitFailure(key: string, options?: RateLimiterOptions) {
  return defaultRateLimiter.recordFailure(key, options)
}

export function resetRateLimit(key: string) {
  defaultRateLimiter.reset(key)
}

export function resetAllRateLimits() {
  defaultRateLimiter.clear()
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
