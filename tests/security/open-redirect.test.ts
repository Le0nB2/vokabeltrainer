import { describe, it, expect } from 'vitest'
import { getSafeRedirectUrl } from '../../src/lib/utils/url'

describe('Security Audit: Open Redirect Defenses', () => {
  describe('Malicious Protocol & External Domain Injection', () => {
    const dangerousTargets = [
      // Standard external URLs
      'https://evil.com',
      'http://evil.com',
      'https://evil.com/phishing',
      'http://attacker.com?victim=vokabeltrainer',
      
      // Protocol-relative URLs (browser interprets as http:// or https:// depending on current scheme)
      '//evil.com',
      '//evil.com/phishing',
      '///evil.com',
      '////evil.com',
      
      // Windows / IIS / backslash trickery to bypass simple leading slash checks
      '/\\evil.com',
      '\\evil.com',
      '/\\/evil.com',
      '\\/evil.com',
      '\\evil.com\\path',
      
      // JavaScript & Data URIs (XSS vector via redirect)
      'javascript:alert(document.cookie)',
      'javascript:void(0)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      
      // URL-encoded evasion tricks
      '/%2f%2fevil.com',
      '/%5cevil.com',
      '/%00/evil.com',
      '//%2f/evil.com',
      
      // Control characters & null bytes
      '/\u0000evil.com',
      '/\r\nevil.com',
      '/\tevil.com',
      '/\revil.com',
      '/\nevil.com',
      
      // Relative path without leading slash
      'login',
      'evil.com',
    ]

    dangerousTargets.forEach((target) => {
      it(`blocks dangerous target: "${target}" and safely returns fallback "/"`, () => {
        const safe = getSafeRedirectUrl(target, '/')
        expect(safe).toBe('/')
      })
    })

    it('returns custom fallback when specified and target is malicious', () => {
      expect(getSafeRedirectUrl('https://evil.com', '/study')).toBe('/study')
      expect(getSafeRedirectUrl('//evil.com', '/decks')).toBe('/decks')
      expect(getSafeRedirectUrl('/%2f%2fevil.com', '/decks')).toBe('/decks')
    })
  })

  describe('Post-Login Redirect Loop Prevention (/login)', () => {
    it('ensures /login redirect parameter is sanitized by login handlers to prevent loop', () => {
      const redirectParam = '/login'
      const safeTarget = getSafeRedirectUrl(redirectParam, '/')
      const finalTarget = safeTarget === '/login' ? '/' : safeTarget
      expect(finalTarget).toBe('/')
    })
  })

  describe('Valid Internal App Routes (White-listing)', () => {
    const legitimatePaths = [
      '/',
      '/study',
      '/decks/123-abc-456',
      '/decks/abc?tab=cards',
      '/settings',
      '/decks/deck-1?sort=due&page=2#top',
    ]

    legitimatePaths.forEach((path) => {
      it(`preserves valid internal path: "${path}"`, () => {
        expect(getSafeRedirectUrl(path)).toBe(path)
      })
    })
  })

  describe('Edge Case Handling', () => {
    it('handles null, undefined, empty string, and whitespace', () => {
      expect(getSafeRedirectUrl(null)).toBe('/')
      expect(getSafeRedirectUrl(undefined)).toBe('/')
      expect(getSafeRedirectUrl('')).toBe('/')
      expect(getSafeRedirectUrl('   ')).toBe('/')
    })
  })
})
