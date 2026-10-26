import { describe, it, expect, beforeEach } from 'vitest'
import {
  RateLimiter,
  consumeRateLimit,
  getClientIpFromHeaders,
  resetAllRateLimits,
} from '../../src/lib/rate-limit'

describe('Security Audit: DoS, Memory Flooding & IP Spoofing Protections', () => {
  beforeEach(() => {
    resetAllRateLimits()
  })

  describe('Rate Limiter Memory Bounds (Anti-Memory Exhaustion)', () => {
    it('bounds total active memory entries and prunes oldest entries during high volume floods', () => {
      const limiter = new RateLimiter()

      // Insert 5,200 distinct keys to trigger the 5000-entry capacity limit
      for (let i = 0; i < 5200; i++) {
        limiter.recordFailure(`bot-ip-${i}`)
      }

      // Memory limit: Store should not grow unbounded above 5000 entries
      expect(limiter.size()).toBeLessThanOrEqual(5000)
    })

    it('prunes expired entries when time window elapses', () => {
      const limiter = new RateLimiter({ windowMs: 100, blockDurationMs: 100 })
      const startTime = Date.now()

      // Add 10 entries at startTime
      for (let i = 0; i < 10; i++) {
        limiter.recordFailure(`key-${i}`)
      }
      expect(limiter.size()).toBe(10)

      // Advance time by 200ms
      limiter.prune(startTime + 200)

      // Expired entries should be pruned from store
      expect(limiter.size()).toBe(0)
    })
  })

  describe('IP Extraction & Spoofing Resilience (getClientIpFromHeaders)', () => {
    it('prioritizes trusted cf-connecting-ip over x-forwarded-for', () => {
      const headers = new Headers({
        'cf-connecting-ip': '198.51.100.5',
        'x-forwarded-for': '203.0.113.195, 10.0.0.1',
      })
      expect(getClientIpFromHeaders(headers)).toBe('198.51.100.5')
    })

    it('prioritizes x-real-ip over x-forwarded-for when cf-connecting-ip is absent', () => {
      const headers = new Headers({
        'x-real-ip': '198.51.100.8',
        'x-forwarded-for': '203.0.113.195',
      })
      expect(getClientIpFromHeaders(headers)).toBe('198.51.100.8')
    })

    it('strips port numbers from IP headers', () => {
      const headers = new Headers({
        'x-real-ip': '198.51.100.9:54321',
      })
      expect(getClientIpFromHeaders(headers)).toBe('198.51.100.9')
    })

    it('falls back to 127.0.0.1 if IP contains malicious characters or injection attempt', () => {
      const maliciousHeaders = [
        new Headers({ 'x-real-ip': '192.168.1.1; DROP TABLE users' }),
        new Headers({ 'x-real-ip': '<script>alert(1)</script>' }),
        new Headers({ 'x-real-ip': 'A'.repeat(100) }),
        { get: (name: string) => name === 'x-real-ip' ? '192.168.1.1\r\nX-Injected: true' : null },
      ]

      maliciousHeaders.forEach((h) => {
        expect(getClientIpFromHeaders(h)).toBe('127.0.0.1')
      })
    })

    it('returns first IP from comma-separated x-forwarded-for chain', () => {
      const headers = new Headers({
        'x-forwarded-for': '198.51.100.15, 10.0.0.1, 172.16.0.1',
      })
      expect(getClientIpFromHeaders(headers)).toBe('198.51.100.15')
    })
  })

  describe('API Endpoint Rate Limiting (consumeRateLimit)', () => {
    it('allows maxAttempts and then blocks subsequent requests within window', () => {
      const key = 'api-test:127.0.0.1'
      const options = { maxAttempts: 3, windowMs: 1000, blockDurationMs: 1000 }

      // 1st request
      const r1 = consumeRateLimit(key, options)
      expect(r1.isBlocked).toBe(false)
      expect(r1.remainingAttempts).toBe(2)

      // 2nd request
      const r2 = consumeRateLimit(key, options)
      expect(r2.isBlocked).toBe(false)
      expect(r2.remainingAttempts).toBe(1)

      // 3rd request (consumes last attempt)
      const r3 = consumeRateLimit(key, options)
      expect(r3.isBlocked).toBe(false)
      expect(r3.remainingAttempts).toBe(0)

      // 4th request while blocked
      const r4 = consumeRateLimit(key, options)
      expect(r4.isBlocked).toBe(true)
      expect(r4.retryAfterSeconds).toBeGreaterThan(0)
    })
  })
})
