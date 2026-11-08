import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getSafeRedirectUrl, getPublicOrigin } from '../src/lib/utils/url'

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

describe('getPublicOrigin', () => {
  const origRenderExternal = process.env.RENDER_EXTERNAL_URL

  afterEach(() => {
    if (origRenderExternal !== undefined) {
      process.env.RENDER_EXTERNAL_URL = origRenderExternal
    } else {
      delete process.env.RENDER_EXTERNAL_URL
    }
  })

  it('prioritizes RENDER_EXTERNAL_URL when set', () => {
    process.env.RENDER_EXTERNAL_URL = 'https://my-app.onrender.com/'
    const origin = getPublicOrigin()
    expect(origin).toBe('https://my-app.onrender.com')
  })

  it('uses X-Forwarded-Host and X-Forwarded-Proto when present', () => {
    delete process.env.RENDER_EXTERNAL_URL
    const req = {
      headers: {
        get: (name: string) => {
          if (name === 'x-forwarded-host') return 'proxy.example.com'
          if (name === 'x-forwarded-proto') return 'https'
          return null
        },
      },
    }
    expect(getPublicOrigin(req)).toBe('https://proxy.example.com')
  })

  it('never returns 0.0.0.0 from internal docker binding', () => {
    delete process.env.RENDER_EXTERNAL_URL
    const req = {
      headers: {
        get: (name: string) => {
          if (name === 'host') return '0.0.0.0:10000'
          return null
        },
      },
      url: 'https://0.0.0.0:10000/callback',
    }
    expect(getPublicOrigin(req)).toBe('http://localhost:3000')
  })

  it('defaults to http://localhost:3000 when no headers or env', () => {
    delete process.env.RENDER_EXTERNAL_URL
    expect(getPublicOrigin(null)).toBe('http://localhost:3000')
  })
})
