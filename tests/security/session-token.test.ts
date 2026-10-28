import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createAppSessionToken,
  verifyAppSessionToken,
  createSettingsSessionToken,
  verifySettingsSessionToken,
  getAppSecret,
  deriveSecretFromPassword,
  secureCompare,
  resetFallbackSecret,
} from '../../src/lib/auth-utils'

describe('Security Audit: Session Token & Cryptographic Integrity', () => {
  const secretKey = 'test-audit-super-secret-key-32-bytes-long!'
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    resetFallbackSecret()
  })

  afterEach(() => {
    process.env = originalEnv
    resetFallbackSecret()
  })

  describe('HMAC Token Tampering Resistance', () => {
    it('accepts an untampered, signed session token', () => {
      const token = createAppSessionToken('alice', secretKey)
      expect(verifyAppSessionToken(token, 'alice', secretKey)).toBe(true)
    })

    it('rejects a token when the payload has been modified (privilege escalation to admin)', () => {
      const originalToken = createAppSessionToken('standard_user', secretKey)
      const [payloadB64, signature] = originalToken.split('.')

      // Attacker attempts to forge payload for admin user
      const forgedPayload = JSON.stringify({
        u: 'admin',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
      const forgedPayloadB64 = Buffer.from(forgedPayload).toString('base64url')
      const tamperedToken = `${forgedPayloadB64}.${signature}`

      expect(verifyAppSessionToken(tamperedToken, 'admin', secretKey)).toBe(false)
      expect(verifyAppSessionToken(tamperedToken, 'standard_user', secretKey)).toBe(false)
    })

    it('rejects a token when the signature has been tampered with or truncated', () => {
      const originalToken = createAppSessionToken('alice', secretKey)
      const [payloadB64, signature] = originalToken.split('.')

      // 1. Bit flip in signature (guaranteed to differ)
      const corruptedSig = signature.substring(0, signature.length - 2) + (signature.endsWith('ab') ? 'cd' : 'ab')
      expect(verifyAppSessionToken(`${payloadB64}.${corruptedSig}`, 'alice', secretKey)).toBe(false)

      // 2. Truncated signature
      const truncatedSig = signature.substring(0, signature.length / 2)
      expect(verifyAppSessionToken(`${payloadB64}.${truncatedSig}`, 'alice', secretKey)).toBe(false)

      // 3. Appended signature
      const appendedSig = signature + '00'
      expect(verifyAppSessionToken(`${payloadB64}.${appendedSig}`, 'alice', secretKey)).toBe(false)
    })

    it('rejects tokens signed with a different secret key', () => {
      const token = createAppSessionToken('alice', 'attacker-key-12345678901234567890')
      expect(verifyAppSessionToken(token, 'alice', secretKey)).toBe(false)
    })

    it('rejects tokens that have expired', () => {
      // Create a token that expired 10 seconds ago
      const expiredToken = createAppSessionToken('alice', secretKey, -10)
      expect(verifyAppSessionToken(expiredToken, 'alice', secretKey)).toBe(false)
    })

    it('rejects tokens where exp is missing, not a number, or NaN', () => {
      const malformedPayload = Buffer.from(JSON.stringify({ u: 'alice' })).toString('base64url')
      // Create signature for this malformed payload
      const crypto = require('crypto')
      const sig = crypto.createHmac('sha256', secretKey).update(malformedPayload).digest('hex')
      const token = `${malformedPayload}.${sig}`

      expect(verifyAppSessionToken(token, 'alice', secretKey)).toBe(false)
    })
  })

  describe('Malformed & Fuzzing Inputs', () => {
    it('gracefully handles null, undefined, empty, and non-string values without throwing', () => {
      expect(verifyAppSessionToken(null, 'alice', secretKey)).toBe(false)
      expect(verifyAppSessionToken(undefined, 'alice', secretKey)).toBe(false)
      expect(verifyAppSessionToken('', 'alice', secretKey)).toBe(false)
      expect(verifyAppSessionToken(12345 as any, 'alice', secretKey)).toBe(false)
      expect(verifyAppSessionToken({} as any, 'alice', secretKey)).toBe(false)
    })

    it('gracefully rejects tokens with invalid delimiter structure', () => {
      expect(verifyAppSessionToken('nodotsatall', 'alice', secretKey)).toBe(false)
      expect(verifyAppSessionToken('too.many.dots.here', 'alice', secretKey)).toBe(false)
      expect(verifyAppSessionToken('.', 'alice', secretKey)).toBe(false)
      expect(verifyAppSessionToken('data.', 'alice', secretKey)).toBe(false)
      expect(verifyAppSessionToken('.sig', 'alice', secretKey)).toBe(false)
    })

    it('gracefully rejects non-JSON payload content', () => {
      const invalidJsonB64 = Buffer.from('THIS IS NOT JSON AT ALL').toString('base64url')
      const crypto = require('crypto')
      const sig = crypto.createHmac('sha256', secretKey).update(invalidJsonB64).digest('hex')
      const token = `${invalidJsonB64}.${sig}`

      expect(verifyAppSessionToken(token, 'alice', secretKey)).toBe(false)
    })

    it('handles giant payloads without crashing (DoS resilience)', () => {
      const giantString = 'A'.repeat(500_000)
      const b64 = Buffer.from(giantString).toString('base64url')
      const token = `${b64}.invalidsig`
      expect(verifyAppSessionToken(token, 'alice', secretKey)).toBe(false)
    })
  })

  describe('Scope Separation (App Auth vs. Settings Auth)', () => {
    it('prevents using an App Session Token to access Settings', () => {
      const appToken = createAppSessionToken('admin', secretKey)
      // Attempt to verify App token as Settings token
      expect(verifySettingsSessionToken(appToken, secretKey)).toBe(false)
    })

    it('prevents using a Settings Session Token to access App features', () => {
      const settingsToken = createSettingsSessionToken(secretKey)
      // Attempt to verify Settings token as App session token
      expect(verifyAppSessionToken(settingsToken, 'admin', secretKey)).toBe(false)
    })

    it('rejects tampered scope in settings token', () => {
      const forgedSettings = Buffer.from(JSON.stringify({
        scope: 'not_settings',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })).toString('base64url')
      const crypto = require('crypto')
      const secret = getAppSecret('mypass')
      const sig = crypto.createHmac('sha256', secret).update(`settings:${forgedSettings}`).digest('hex')
      const token = `${forgedSettings}.${sig}`

      expect(verifySettingsSessionToken(token, 'mypass')).toBe(false)
    })
  })

  describe('Timing Attack Resistance (secureCompare)', () => {
    it('returns true for matching strings and false for mismatched strings', () => {
      expect(secureCompare('supersecret', 'supersecret')).toBe(true)
      expect(secureCompare('supersecret', 'supersecreT')).toBe(false)
      expect(secureCompare('short', 'much_longer_string_here')).toBe(false)
      expect(secureCompare('', '')).toBe(true)
      expect(secureCompare('', 'a')).toBe(false)
    })
  })

  describe('Secret Derivation & In-Memory Fallback Entropy', () => {
    it('derives a strong 256-bit hex key from password', () => {
      const derived = deriveSecretFromPassword('simple_password')
      expect(derived).toMatch(/^[0-9a-f]{64}$/)
      // Same password yields deterministic key
      expect(deriveSecretFromPassword('simple_password')).toBe(derived)
      // Different password yields different key
      expect(deriveSecretFromPassword('different_password')).not.toBe(derived)
    })

    it('generates consistent random 256-bit in-memory secret when no env secret is configured', () => {
      delete process.env.AUTH_SECRET
      delete process.env.SESSION_SECRET

      const secret1 = getAppSecret()
      const secret2 = getAppSecret()
      expect(secret1).toBe(secret2)
      expect(secret1.length).toBeGreaterThanOrEqual(64)
    })
  })
})
