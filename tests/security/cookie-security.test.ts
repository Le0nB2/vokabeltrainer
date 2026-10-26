import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isSecureRequest, AUTH_COOKIE_NAME, SETTINGS_COOKIE_NAME } from '../../src/lib/auth-utils'
import { loginApp, logoutApp, logoutSettings, checkPassword } from '../../src/actions/auth'
import { resetAllRateLimits } from '../../src/lib/rate-limit'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('Security Audit: Cookie Flags & HTTPS Transmission Defenses', () => {
  const originalEnv = process.env

  beforeEach(() => {
    resetAllRateLimits()
    globalThis.__mockCookies.clear()
    globalThis.__mockHeaders.clear()
    process.env = { ...originalEnv }
    process.env.AUTH_USER = 'admin'
    process.env.AUTH_PASSWORD = 'password123'
    process.env.SETTINGS_PASSWORD = 'settingspass'
  })

  afterEach(() => {
    process.env = originalEnv
    resetAllRateLimits()
  })

  describe('HTTPS / Secure Transport Detection (isSecureRequest)', () => {
    it('detects secure request when x-forwarded-proto is https', () => {
      const headers = new Headers({ 'x-forwarded-proto': 'https' })
      expect(isSecureRequest(headers)).toBe(true)
    })

    it('detects unsecure request when x-forwarded-proto is http', () => {
      const headers = new Headers({ 'x-forwarded-proto': 'http' })
      expect(isSecureRequest(headers)).toBe(false)
    })

    it('handles comma-separated proxy list in x-forwarded-proto', () => {
      const headers = new Headers({ 'x-forwarded-proto': 'https, http, https' })
      expect(isSecureRequest(headers)).toBe(true)

      const headersHttp = new Headers({ 'x-forwarded-proto': 'http, https' })
      expect(isSecureRequest(headersHttp)).toBe(false)
    })

    it('detects secure request from alternative proxy headers', () => {
      expect(isSecureRequest(new Headers({ 'x-forwarded-ssl': 'on' }))).toBe(true)
      expect(isSecureRequest(new Headers({ 'front-end-https': 'on' }))).toBe(true)
      expect(isSecureRequest(new Headers({ 'x-url-scheme': 'https' }))).toBe(true)
    })

    it('detects secure request from origin and referer headers', () => {
      expect(isSecureRequest(new Headers({ origin: 'https://vokabeltrainer.example.com' }))).toBe(true)
      expect(isSecureRequest(new Headers({ origin: 'http://vokabeltrainer.example.com' }))).toBe(false)
      expect(isSecureRequest(new Headers({ referer: 'https://vokabeltrainer.example.com/login' }))).toBe(true)
    })

    it('respects explicit COOKIE_SECURE environment override', () => {
      process.env.COOKIE_SECURE = 'true'
      expect(isSecureRequest(new Headers({ 'x-forwarded-proto': 'http' }))).toBe(true)

      process.env.COOKIE_SECURE = 'false'
      expect(isSecureRequest(new Headers({ 'x-forwarded-proto': 'https' }))).toBe(false)
    })
  })

  describe('Cookie Security Attributes on Login & Settings Authentication', () => {
    it('sets HttpOnly, SameSite=lax, path=/, and secure flag on successful app login', async () => {
      globalThis.__mockHeaders.set('x-forwarded-proto', 'https')

      const res = await loginApp({ username: 'admin', password: 'password123' })
      expect(res.success).toBe(true)

      const authCookie = globalThis.__mockCookies.get(AUTH_COOKIE_NAME)
      expect(authCookie).toBeDefined()
      expect(authCookie.httpOnly).toBe(true)
      expect(authCookie.secure).toBe(true)
      expect(authCookie.sameSite).toBe('lax')
      expect(authCookie.path).toBe('/')
      expect(authCookie.maxAge).toBe(30 * 24 * 60 * 60) // 30 days
    })

    it('sets HttpOnly, SameSite=lax, path=/, and secure flag on settings unlock', async () => {
      globalThis.__mockHeaders.set('x-forwarded-proto', 'https')

      const res = await checkPassword('settingspass')
      expect(res.success).toBe(true)

      const settingsCookie = globalThis.__mockCookies.get(SETTINGS_COOKIE_NAME)
      expect(settingsCookie).toBeDefined()
      expect(settingsCookie.httpOnly).toBe(true)
      expect(settingsCookie.secure).toBe(true)
      expect(settingsCookie.sameSite).toBe('lax')
      expect(settingsCookie.path).toBe('/')
      expect(settingsCookie.maxAge).toBe(24 * 60 * 60) // 1 day
    })
  })

  describe('Cookie Invalidation on Logout', () => {
    it('clears both app and settings cookies with maxAge 0 on app logout', async () => {
      // Setup initial cookies
      globalThis.__mockCookies.set(AUTH_COOKIE_NAME, { value: 'token123' })
      globalThis.__mockCookies.set(SETTINGS_COOKIE_NAME, { value: 'token456' })

      const res = await logoutApp()
      expect(res.success).toBe(true)

      const appCookie = globalThis.__mockCookies.get(AUTH_COOKIE_NAME)
      expect(appCookie.value).toBe('')
      expect(appCookie.maxAge).toBe(0)

      const settingsCookie = globalThis.__mockCookies.get(SETTINGS_COOKIE_NAME)
      expect(settingsCookie.value).toBe('')
      expect(settingsCookie.maxAge).toBe(0)
    })

    it('clears settings cookie with maxAge 0 on settings lock/logout', async () => {
      globalThis.__mockCookies.set(SETTINGS_COOKIE_NAME, { value: 'token456' })

      const res = await logoutSettings()
      expect(res.success).toBe(true)

      const settingsCookie = globalThis.__mockCookies.get(SETTINGS_COOKIE_NAME)
      expect(settingsCookie.value).toBe('')
      expect(settingsCookie.maxAge).toBe(0)
    })
  })
})
