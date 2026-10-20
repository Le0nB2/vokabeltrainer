import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  RateLimiter,
  formatRetryDuration,
  checkRateLimit,
  recordRateLimitFailure,
  resetRateLimit,
  resetAllRateLimits,
} from '../src/lib/rate-limit'

describe('RateLimiter utility', () => {
  beforeEach(() => {
    resetAllRateLimits()
    vi.useRealTimers()
  })

  describe('formatRetryDuration', () => {
    it('formats 1 second correctly', () => {
      expect(formatRetryDuration(1)).toBe('1 Sekunde')
    })

    it('formats multiple seconds correctly', () => {
      expect(formatRetryDuration(30)).toBe('30 Sekunden')
      expect(formatRetryDuration(59)).toBe('59 Sekunden')
    })

    it('formats 1 minute correctly', () => {
      expect(formatRetryDuration(60)).toBe('1 Minute')
      expect(formatRetryDuration(90)).toBe('2 Minuten')
    })

    it('formats multiple minutes correctly', () => {
      expect(formatRetryDuration(120)).toBe('2 Minuten')
      expect(formatRetryDuration(900)).toBe('15 Minuten')
    })
  })

  describe('RateLimiter class', () => {
    it('initial check returns not blocked with full remaining attempts', () => {
      const limiter = new RateLimiter({ maxAttempts: 5, windowMs: 60000, blockDurationMs: 60000 })
      const status = limiter.check('test-ip')
      expect(status.isBlocked).toBe(false)
      expect(status.remainingAttempts).toBe(5)
      expect(status.retryAfterSeconds).toBe(0)
    })

    it('decrements remaining attempts on failure', () => {
      const limiter = new RateLimiter({ maxAttempts: 3, windowMs: 60000, blockDurationMs: 60000 })
      const res1 = limiter.recordFailure('test-ip')
      expect(res1.isBlocked).toBe(false)
      expect(res1.remainingAttempts).toBe(2)

      const res2 = limiter.recordFailure('test-ip')
      expect(res2.isBlocked).toBe(false)
      expect(res2.remainingAttempts).toBe(1)
    })

    it('blocks when maxAttempts failures are recorded', () => {
      const limiter = new RateLimiter({ maxAttempts: 3, windowMs: 60000, blockDurationMs: 60000 })
      limiter.recordFailure('test-ip')
      limiter.recordFailure('test-ip')
      const res3 = limiter.recordFailure('test-ip')

      expect(res3.isBlocked).toBe(true)
      expect(res3.remainingAttempts).toBe(0)
      expect(res3.retryAfterSeconds).toBeGreaterThan(0)

      const checkStatus = limiter.check('test-ip')
      expect(checkStatus.isBlocked).toBe(true)
      expect(checkStatus.remainingAttempts).toBe(0)
    })

    it('resets key when reset is called', () => {
      const limiter = new RateLimiter({ maxAttempts: 3, windowMs: 60000, blockDurationMs: 60000 })
      limiter.recordFailure('test-ip')
      limiter.recordFailure('test-ip')
      limiter.reset('test-ip')

      const checkStatus = limiter.check('test-ip')
      expect(checkStatus.isBlocked).toBe(false)
      expect(checkStatus.remainingAttempts).toBe(3)
    })

    it('handles different keys independently', () => {
      const limiter = new RateLimiter({ maxAttempts: 2, windowMs: 60000, blockDurationMs: 60000 })
      limiter.recordFailure('ip-attacker')
      limiter.recordFailure('ip-attacker')

      expect(limiter.check('ip-attacker').isBlocked).toBe(true)
      expect(limiter.check('ip-legit').isBlocked).toBe(false)
      expect(limiter.check('ip-legit').remainingAttempts).toBe(2)
    })

    it('unblocks after blockDurationMs expires', () => {
      vi.useFakeTimers()
      const now = Date.now()
      vi.setSystemTime(now)

      const limiter = new RateLimiter({ maxAttempts: 2, windowMs: 10000, blockDurationMs: 10000 })
      limiter.recordFailure('test-ip')
      limiter.recordFailure('test-ip')
      expect(limiter.check('test-ip').isBlocked).toBe(true)

      // Advance time by 11 seconds
      vi.setSystemTime(now + 11000)
      expect(limiter.check('test-ip').isBlocked).toBe(false)
    })
  })

  describe('exported helper functions', () => {
    it('works with checkRateLimit, recordRateLimitFailure, and resetRateLimit', () => {
      expect(checkRateLimit('helper-key', { maxAttempts: 2 }).isBlocked).toBe(false)
      recordRateLimitFailure('helper-key', { maxAttempts: 2 })
      recordRateLimitFailure('helper-key', { maxAttempts: 2 })
      expect(checkRateLimit('helper-key', { maxAttempts: 2 }).isBlocked).toBe(true)

      resetRateLimit('helper-key')
      expect(checkRateLimit('helper-key', { maxAttempts: 2 }).isBlocked).toBe(false)
    })
  })
})
