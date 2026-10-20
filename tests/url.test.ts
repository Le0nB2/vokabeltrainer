import { describe, it, expect } from 'vitest'
import { getSafeRedirectUrl } from '../src/lib/utils/url'

describe('getSafeRedirectUrl', () => {
  it('allows safe relative paths', () => {
    expect(getSafeRedirectUrl('/')).toBe('/')
    expect(getSafeRedirectUrl('/study')).toBe('/study')
    expect(getSafeRedirectUrl('/decks/deck-123')).toBe('/decks/deck-123')
    expect(getSafeRedirectUrl('/decks?filter=due#card-1')).toBe('/decks?filter=due#card-1')
  })

  it('trims whitespace around safe relative paths', () => {
    expect(getSafeRedirectUrl('  /study  ')).toBe('/study')
  })

  it('rejects protocol-relative URLs (//evil.com)', () => {
    expect(getSafeRedirectUrl('//evil.com')).toBe('/')
    expect(getSafeRedirectUrl('//evil.com/path')).toBe('/')
    expect(getSafeRedirectUrl('///evil.com')).toBe('/')
  })

  it('rejects backslash bypasses (/\\evil.com or \\evil.com)', () => {
    expect(getSafeRedirectUrl('/\\evil.com')).toBe('/')
    expect(getSafeRedirectUrl('\\evil.com')).toBe('/')
    expect(getSafeRedirectUrl('\\/evil.com')).toBe('/')
  })

  it('rejects external absolute URLs', () => {
    expect(getSafeRedirectUrl('https://evil.com')).toBe('/')
    expect(getSafeRedirectUrl('http://evil.com/login')).toBe('/')
    expect(getSafeRedirectUrl('javascript:alert(1)')).toBe('/')
    expect(getSafeRedirectUrl('data:text/html,<h1>pwned</h1>')).toBe('/')
  })

  it('rejects null, undefined, empty, or non-string inputs', () => {
    expect(getSafeRedirectUrl(null)).toBe('/')
    expect(getSafeRedirectUrl(undefined)).toBe('/')
    expect(getSafeRedirectUrl('')).toBe('/')
    expect(getSafeRedirectUrl('   ')).toBe('/')
    expect(getSafeRedirectUrl(123 as any)).toBe('/')
  })

  it('uses custom fallback when target is invalid', () => {
    expect(getSafeRedirectUrl('https://evil.com', '/fallback')).toBe('/fallback')
    expect(getSafeRedirectUrl(null, '/decks')).toBe('/decks')
    expect(getSafeRedirectUrl('//evil.com', '/decks')).toBe('/decks')
  })
})
