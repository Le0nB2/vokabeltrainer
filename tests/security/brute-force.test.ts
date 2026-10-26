import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loginApp, checkPassword } from '../../src/actions/auth'
import { resetAllRateLimits, checkRateLimit } from '../../src/lib/rate-limit'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('Security Audit: Brute-Force & Credential Stuffing Defenses', () => {
  const originalEnv = process.env
  let setTimeoutSpy: any

  beforeEach(() => {
    resetAllRateLimits()
    globalThis.__mockCookies.clear()
    globalThis.__mockHeaders.clear()
    process.env = { ...originalEnv }
    process.env.AUTH_USER = 'victim_user'
    process.env.AUTH_PASSWORD = 'CorrectPassword123!'
    process.env.SETTINGS_PASSWORD = 'AdminSettingsSecret456!'

    // Bypass real-time 500ms delay during tests for fast and deterministic test runs
    setTimeoutSpy = vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
      if (typeof fn === 'function') fn()
      return 0 as any
    })
  })

  afterEach(() => {
    process.env = originalEnv
    resetAllRateLimits()
    if (setTimeoutSpy) setTimeoutSpy.mockRestore()
  })

  describe('Login Rate Limiting (IP-level)', () => {
    it('allows 5 failed attempts from an IP and blocks on the 6th attempt', async () => {
      globalThis.__mockHeaders.set('x-forwarded-for', '198.51.100.10')

      // First 5 attempts fail with invalid credentials
      for (let i = 0; i < 5; i++) {
        const res = await loginApp({ username: 'victim_user', password: `wrong_${i}` })
        expect(res.success).toBe(false)
        expect(res.error).toBe('Ungültiger Benutzername oder falsches Passwort')
      }

      // 6th attempt should be blocked by IP rate limit even with the CORRECT password
      const blockedRes = await loginApp({ username: 'victim_user', password: 'CorrectPassword123!' })
      expect(blockedRes.success).toBe(false)
      expect(blockedRes.error).toContain('Zu viele Fehlversuche')
      expect(blockedRes.error).toMatch(/Bitte versuche es in .* erneut/)
    })

    it('isolates IP rate limits between different IP addresses', async () => {
      // IP 1 runs 5 failed attempts and gets blocked
      globalThis.__mockHeaders.set('x-forwarded-for', '198.51.100.20')
      for (let i = 0; i < 5; i++) {
        await loginApp({ username: 'victim_user', password: `wrong_${i}` })
      }
      const ip1Blocked = await loginApp({ username: 'victim_user', password: 'CorrectPassword123!' })
      expect(ip1Blocked.success).toBe(false)
      expect(ip1Blocked.error).toContain('Zu viele Fehlversuche')

      // IP 2 with correct password can still log in successfully
      globalThis.__mockHeaders.set('x-forwarded-for', '198.51.100.30')
      const ip2Allowed = await loginApp({ username: 'victim_user', password: 'CorrectPassword123!' })
      expect(ip2Allowed.success).toBe(true)
    })
  })

  describe('Distributed Credential Stuffing / Account Spraying (User-level & Global)', () => {
    it('blocks distributed attack against a single user across multiple rotating IPs after 10 attempts', async () => {
      // Simulate botnet rotating through 10 distinct IPs targeting 'victim_user'
      for (let i = 0; i < 10; i++) {
        globalThis.__mockHeaders.set('x-forwarded-for', `203.0.113.${10 + i}`)
        const res = await loginApp({ username: 'victim_user', password: `guess_${i}` })
        expect(res.success).toBe(false)
      }

      // 11th attempt from a fresh IP should be blocked by the user account rate limiter
      globalThis.__mockHeaders.set('x-forwarded-for', '203.0.113.99')
      const userBlocked = await loginApp({ username: 'victim_user', password: 'CorrectPassword123!' })
      expect(userBlocked.success).toBe(false)
      expect(userBlocked.error).toContain('Zu viele Fehlversuche für diesen Benutzer')
    })

    it('blocks global password spraying attack after 50 failed attempts across different accounts and IPs', async () => {
      // 50 attempts with random users and random IPs
      for (let i = 0; i < 50; i++) {
        globalThis.__mockHeaders.set('x-forwarded-for', `192.0.2.${i + 1}`)
        await loginApp({ username: `random_user_${i}`, password: 'password123' })
      }

      // 51st attempt from yet another IP and user is blocked globally
      globalThis.__mockHeaders.set('x-forwarded-for', '192.0.2.100')
      const globalBlocked = await loginApp({ username: 'victim_user', password: 'CorrectPassword123!' })
      expect(globalBlocked.success).toBe(false)
      expect(globalBlocked.error).toContain('Zu viele fehlerhafte Anmeldeversuche')
    })
  })

  describe('Settings Password Brute-Force Defenses', () => {
    it('blocks repeated incorrect settings password attempts via IP rate limiting', async () => {
      globalThis.__mockHeaders.set('x-forwarded-for', '198.51.100.50')

      for (let i = 0; i < 5; i++) {
        const res = await checkPassword(`wrong_pass_${i}`)
        expect(res.success).toBe(false)
        expect(res.error).toBe('Falsches Passwort')
      }

      // 6th attempt should be blocked even with the correct settings password
      const blockedRes = await checkPassword('AdminSettingsSecret456!')
      expect(blockedRes.success).toBe(false)
      expect(blockedRes.error).toContain('Zu viele Fehlversuche')
    })

    it('resets rate limit on successful authentication', async () => {
      globalThis.__mockHeaders.set('x-forwarded-for', '198.51.100.60')

      // 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await checkPassword(`wrong_pass_${i}`)
      }

      // 4th attempt is successful
      const successRes = await checkPassword('AdminSettingsSecret456!')
      expect(successRes.success).toBe(true)

      // Subsequent check should have clear rate limit
      const limitStatus = checkRateLimit('settings:198.51.100.60')
      expect(limitStatus.isBlocked).toBe(false)
      expect(limitStatus.remainingAttempts).toBe(5)
    })
  })
})
