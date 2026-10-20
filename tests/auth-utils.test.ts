import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  secureCompare,
  getAppAuthCredentials,
  getAppSecret,
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
    vi.resetModules()
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
})
