import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  secureCompare,
  getAppAuthCredentials,
  getAppSecret,
  getFallbackSecret,
  resetFallbackSecret,
  isSecureRequest,
  createAppSessionToken,
  verifyAppSessionToken,
  createSettingsSessionToken,
  verifySettingsSessionToken,
  getSessionCookieValue,
  verifySessionCookie,
  SETTINGS_COOKIE_NAME,
  SETTINGS_COOKIE_MAX_AGE,
} from '../src/lib/auth-utils'

describe('auth-utils', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('secureCompare', () => {
    it('returns true for identical strings', () => {
      expect(secureCompare('secret123', 'secret123')).toBe(true)
      expect(secureCompare('', '')).toBe(true)
      expect(secureCompare('admin:with:colons!@#', 'admin:with:colons!@#')).toBe(true)
    })

    it('returns false for different strings or lengths', () => {
      expect(secureCompare('secret123', 'secret124')).toBe(false)
      expect(secureCompare('short', 'muchlongerpassword')).toBe(false)
      expect(secureCompare('admin', '')).toBe(false)
    })
  })

  describe('getAppAuthCredentials', () => {
    it('reads AUTH_USER and AUTH_PASSWORD when set', () => {
      process.env.AUTH_USER = 'john'
      process.env.AUTH_PASSWORD = 'doe'
      process.env.BASIC_AUTH_USER = 'ignored'
      process.env.BASIC_AUTH_PASSWORD = 'ignored'

      const creds = getAppAuthCredentials()
      expect(creds.user).toBe('john')
      expect(creds.password).toBe('doe')
      expect(creds.isConfigured).toBe(true)
    })

    it('falls back to BASIC_AUTH_USER and BASIC_AUTH_PASSWORD', () => {
      delete process.env.AUTH_USER
      delete process.env.AUTH_PASSWORD
      process.env.BASIC_AUTH_USER = 'basicUser'
      process.env.BASIC_AUTH_PASSWORD = 'basicPassword'

      const creds = getAppAuthCredentials()
      expect(creds.user).toBe('basicUser')
      expect(creds.password).toBe('basicPassword')
      expect(creds.isConfigured).toBe(true)
    })

    it('reports isConfigured as false when credentials are not set', () => {
      delete process.env.AUTH_USER
      delete process.env.AUTH_PASSWORD
      delete process.env.BASIC_AUTH_USER
      delete process.env.BASIC_AUTH_PASSWORD

      const creds = getAppAuthCredentials()
      expect(creds.isConfigured).toBe(false)
    })
  })

  describe('SEC-09: Fallback Secret Hardening (getAppSecret & getFallbackSecret)', () => {
    beforeEach(() => {
      delete process.env.AUTH_SECRET
      delete process.env.SESSION_SECRET
      resetFallbackSecret()
    })

    it('prefers AUTH_SECRET when configured in environment', () => {
      process.env.AUTH_SECRET = 'explicit-auth-secret'
      process.env.SESSION_SECRET = 'ignored-session-secret'
      expect(getAppSecret()).toBe('explicit-auth-secret')
    })

    it('prefers SESSION_SECRET when AUTH_SECRET is not configured', () => {
      delete process.env.AUTH_SECRET
      process.env.SESSION_SECRET = 'explicit-session-secret'
      expect(getAppSecret()).toBe('explicit-session-secret')
    })

    it('uses provided password when no environment secrets are set', () => {
      delete process.env.AUTH_SECRET
      delete process.env.SESSION_SECRET
      expect(getAppSecret('admin-pass-123')).toBe('admin-pass-123')
    })

    it('generates a cryptographically random 256-bit hex secret and never uses the static fallback', () => {
      delete process.env.AUTH_SECRET
      delete process.env.SESSION_SECRET
      const secret = getAppSecret()

      // Never use the hardcoded static secret string
      expect(secret).not.toBe('vokabeltrainer-session-secret')
      // 32 bytes in hex = 64 characters
      expect(secret).toHaveLength(64)
      expect(secret).toMatch(/^[0-9a-f]{64}$/)
    })

    it('persists the in-memory fallback secret across multiple calls within the same process', () => {
      delete process.env.AUTH_SECRET
      delete process.env.SESSION_SECRET
      const first = getAppSecret()
      const second = getAppSecret()
      const fallback = getFallbackSecret()

      expect(first).toBe(second)
      expect(second).toBe(fallback)
    })

    it('generates a new unique secret after resetFallbackSecret()', () => {
      delete process.env.AUTH_SECRET
      delete process.env.SESSION_SECRET
      const first = getAppSecret()
      resetFallbackSecret()
      const second = getAppSecret()

      expect(first).not.toBe(second)
      expect(first).toHaveLength(64)
      expect(second).toHaveLength(64)
    })
  })

  describe('createAppSessionToken & verifyAppSessionToken', () => {
    const secret = 'super-secret-key'

    it('creates and verifies a valid token', () => {
      const token = createAppSessionToken('admin', secret, 3600)
      expect(typeof token).toBe('string')
      expect(token).toContain('.')

      const isValid = verifyAppSessionToken(token, 'admin', secret)
      expect(isValid).toBe(true)
    })

    it('rejects expired token', () => {
      const token = createAppSessionToken('admin', secret, -100)
      const isValid = verifyAppSessionToken(token, 'admin', secret)
      expect(isValid).toBe(false)
    })

    it('rejects tampered token payload', () => {
      const token = createAppSessionToken('admin', secret, 3600)
      const [payload, sig] = token.split('.')

      // Tamper with payload
      const tamperedPayload = Buffer.from(
        JSON.stringify({ u: 'hacker', exp: Math.floor(Date.now() / 1000) + 3600 })
      ).toString('base64url')

      const isValid = verifyAppSessionToken(`${tamperedPayload}.${sig}`, 'hacker', secret)
      expect(isValid).toBe(false)
    })

    it('rejects token signed with a different secret', () => {
      const token = createAppSessionToken('admin', 'different-secret', 3600)
      const isValid = verifyAppSessionToken(token, 'admin', secret)
      expect(isValid).toBe(false)
    })

    it('rejects token for different user', () => {
      const token = createAppSessionToken('userA', secret, 3600)
      const isValid = verifyAppSessionToken(token, 'userB', secret)
      expect(isValid).toBe(false)
    })

    it('handles malformed tokens safely without crashing', () => {
      expect(verifyAppSessionToken(null, 'admin', secret)).toBe(false)
      expect(verifyAppSessionToken(undefined, 'admin', secret)).toBe(false)
      expect(verifyAppSessionToken('', 'admin', secret)).toBe(false)
      expect(verifyAppSessionToken('no-dot-here', 'admin', secret)).toBe(false)
      expect(verifyAppSessionToken('too.many.dots.here', 'admin', secret)).toBe(false)
      expect(verifyAppSessionToken('invalidbase64!@#.invalidsig', 'admin', secret)).toBe(false)
    })
  })

  describe('SEC-04: Settings Session Token with Expiration', () => {
    const password = 'settings-admin-pass'

    it('exports correct cookie name and max age', () => {
      expect(SETTINGS_COOKIE_NAME).toBe('settings_auth')
      expect(SETTINGS_COOKIE_MAX_AGE).toBe(24 * 60 * 60)
    })

    it('creates and verifies a valid settings session token', () => {
      const token = createSettingsSessionToken(password, 3600)
      expect(typeof token).toBe('string')
      expect(token).toContain('.')

      const isValid = verifySettingsSessionToken(token, password)
      expect(isValid).toBe(true)
    })

    it('rejects expired settings session token', () => {
      const token = createSettingsSessionToken(password, -100)
      const isValid = verifySettingsSessionToken(token, password)
      expect(isValid).toBe(false)
    })

    it('rejects settings token with wrong password', () => {
      const token = createSettingsSessionToken(password, 3600)
      expect(verifySettingsSessionToken(token, 'wrong-password')).toBe(false)
    })

    it('rejects tampered settings payload', () => {
      const token = createSettingsSessionToken(password, 3600)
      const [payload, sig] = token.split('.')
      const tampered = Buffer.from(
        JSON.stringify({ scope: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 })
      ).toString('base64url')

      expect(verifySettingsSessionToken(`${tampered}.${sig}`, password)).toBe(false)
    })

    it('rejects invalid or malformed settings tokens', () => {
      expect(verifySettingsSessionToken(null, password)).toBe(false)
      expect(verifySettingsSessionToken(undefined, password)).toBe(false)
      expect(verifySettingsSessionToken('', password)).toBe(false)
      expect(verifySettingsSessionToken('no-dot-here', password)).toBe(false)
      expect(verifySettingsSessionToken('too.many.dots.here', password)).toBe(false)
      expect(verifySettingsSessionToken('invalidbase64.invalidsig', password)).toBe(false)
    })

    it('bypasses settings auth if password is not configured', () => {
      expect(verifySettingsSessionToken(undefined, undefined)).toBe(true)
      expect(verifySettingsSessionToken('', undefined)).toBe(true)
      expect(verifySettingsSessionToken('any-token', undefined)).toBe(true)
    })

    it('supports backward compatibility aliases getSessionCookieValue & verifySessionCookie', () => {
      const cookieValue = getSessionCookieValue(password)
      expect(verifySessionCookie(cookieValue, password)).toBe(true)
      expect(verifySessionCookie('wrong-cookie', password)).toBe(false)
      expect(verifySessionCookie(cookieValue, 'wrong-pass')).toBe(false)
      expect(verifySessionCookie(undefined, undefined)).toBe(true)
    })
  })

  describe('SEC-10: isSecureRequest & Cookie Security', () => {
    function createMockHeaders(map: Record<string, string>) {
      const lowerMap = new Map(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]))
      return {
        get: (key: string) => lowerMap.get(key.toLowerCase()) || null,
      }
    }

    beforeEach(() => {
      delete process.env.COOKIE_SECURE
      ;(process.env as Record<string, string | undefined>).NODE_ENV = 'development'
    })

    it('identifies standard https from x-forwarded-proto', () => {
      const headers = createMockHeaders({ 'x-forwarded-proto': 'https' })
      expect(isSecureRequest(headers)).toBe(true)
    })

    it('identifies https from comma-separated proxy chain in x-forwarded-proto', () => {
      const headers = createMockHeaders({ 'x-forwarded-proto': 'https, http, https' })
      expect(isSecureRequest(headers)).toBe(true)
    })

    it('identifies plain http from comma-separated proxy chain', () => {
      const headers = createMockHeaders({ 'x-forwarded-proto': 'http, https' })
      expect(isSecureRequest(headers)).toBe(false)
    })

    it('identifies https from alternative proxy headers (x-forwarded-ssl, front-end-https, x-url-scheme)', () => {
      expect(isSecureRequest(createMockHeaders({ 'x-forwarded-ssl': 'on' }))).toBe(true)
      expect(isSecureRequest(createMockHeaders({ 'front-end-https': 'on' }))).toBe(true)
      expect(isSecureRequest(createMockHeaders({ 'x-url-scheme': 'https' }))).toBe(true)
    })

    it('identifies https from origin and referer headers', () => {
      expect(isSecureRequest(createMockHeaders({ origin: 'https://vokabeltrainer.example.com' }))).toBe(true)
      expect(isSecureRequest(createMockHeaders({ referer: 'https://vokabeltrainer.example.com/login' }))).toBe(true)
    })

    it('identifies unencrypted http from origin or referer on local network', () => {
      expect(isSecureRequest(createMockHeaders({ origin: 'http://192.168.1.50:3000' }))).toBe(false)
      expect(isSecureRequest(createMockHeaders({ referer: 'http://192.168.1.50:3000/login' }))).toBe(false)
    })

    it('respects COOKIE_SECURE=true override regardless of headers', () => {
      process.env.COOKIE_SECURE = 'true'
      const headers = createMockHeaders({ 'x-forwarded-proto': 'http' })
      expect(isSecureRequest(headers)).toBe(true)
    })

    it('respects COOKIE_SECURE=false override even if request is https', () => {
      process.env.COOKIE_SECURE = 'false'
      const headers = createMockHeaders({ 'x-forwarded-proto': 'https' })
      expect(isSecureRequest(headers)).toBe(false)
    })

    it('defaults to true in production if no unencrypted indicator is present', () => {
      ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
      expect(isSecureRequest(null)).toBe(true)
      expect(isSecureRequest(createMockHeaders({}))).toBe(true)
    })

    it('defaults to false in development if no https header is present', () => {
      ;(process.env as Record<string, string | undefined>).NODE_ENV = 'development'
      expect(isSecureRequest(null)).toBe(false)
      expect(isSecureRequest(createMockHeaders({}))).toBe(false)
    })
  })
})
