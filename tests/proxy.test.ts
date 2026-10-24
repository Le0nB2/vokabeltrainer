import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { proxy } from '../src/proxy'
import { NextRequest } from 'next/server'
import { createAppSessionToken, getAppSecret, AUTH_COOKIE_NAME } from '../src/lib/auth-utils'

// Mock next/server response methods
vi.mock('next/server', () => {
  return {
    NextResponse: class {
      body: any
      status: number
      headers: Map<string, string>
      url?: string
      type: string

      constructor(body: any, init: any) {
        this.body = body
        this.status = init?.status || 200
        this.headers = new Map(Object.entries(init?.headers || {}))
        this.type = 'response'
      }

      static next() {
        return { status: 200, type: 'next' }
      }

      static redirect(url: string | URL) {
        return {
          status: 307,
          type: 'redirect',
          url: typeof url === 'string' ? url : url.toString(),
        }
      }

      static json(body: any, init?: any) {
        return {
          status: init?.status || 200,
          type: 'json',
          body,
          headers: new Map(Object.entries(init?.headers || {})),
        }
      }
    },
  }
})

describe('proxy middleware session auth', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    process.env.AUTH_USER = 'testuser'
    process.env.AUTH_PASSWORD = 'testpassword123'
    delete process.env.BASIC_AUTH_USER
    delete process.env.BASIC_AUTH_PASSWORD
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  function createMockRequest(pathname = '/', cookieValue?: string | null): NextRequest {
    const url = new URL(pathname, 'http://localhost:3000')
    const cookiesMap = new Map<string, { name: string; value: string }>()
    if (cookieValue) {
      cookiesMap.set(AUTH_COOKIE_NAME, { name: AUTH_COOKIE_NAME, value: cookieValue })
    }

    return {
      url: url.toString(),
      nextUrl: url,
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === 'cookie' && cookieValue) {
            return `${AUTH_COOKIE_NAME}=${cookieValue}`
          }
          return null
        },
      },
      cookies: {
        get: (name: string) => cookiesMap.get(name),
      },
    } as unknown as NextRequest
  }

  it('should bypass auth if env vars are missing', async () => {
    delete process.env.AUTH_USER
    delete process.env.AUTH_PASSWORD
    delete process.env.BASIC_AUTH_USER
    delete process.env.BASIC_AUTH_PASSWORD

    const req = createMockRequest('/')
    const result = await proxy(req)
    expect(result).toEqual({ status: 200, type: 'next' })
  })

  it('should redirect unauthenticated page requests from / to /login', async () => {
    const req = createMockRequest('/')
    const result: any = await proxy(req)
    expect(result.type).toBe('redirect')
    expect(result.url).toBe('http://localhost:3000/login')
  })

  it('should redirect unauthenticated page requests preserving target in redirect param', async () => {
    const req = createMockRequest('/decks/deck-123?filter=due')
    const result: any = await proxy(req)
    expect(result.type).toBe('redirect')
    expect(result.url).toBe('http://localhost:3000/login?redirect=%2Fdecks%2Fdeck-123%3Ffilter%3Ddue')
  })

  it('should allow unauthenticated access to /login', async () => {
    const req = createMockRequest('/login')
    const result = await proxy(req)
    expect(result).toEqual({ status: 200, type: 'next' })
  })

  it('should allow unauthenticated access to app icons and manifest', async () => {
    const paths = [
      '/apple-icon',
      '/apple-touch-icon.png',
      '/apple-touch-icon-precomposed.png',
      '/favicon.ico',
      '/manifest.json',
      '/icon-192.png',
    ]

    for (const p of paths) {
      const req = createMockRequest(p)
      const result = await proxy(req)
      expect(result).toEqual({ status: 200, type: 'next' })
    }
  })

  it('should not allow unauthenticated access to arbitrary paths prefixed with /icon-', async () => {
    const req = createMockRequest('/icon-fake-admin')
    const result: any = await proxy(req)
    expect(result.type).toBe('redirect')
    expect(result.url).toContain('/login?redirect=%2Ficon-fake-admin')
  })

  it('should return 401 JSON without WWW-Authenticate header for unauthenticated /api requests', async () => {
    const req = createMockRequest('/api/notifications/due-count')
    const result: any = await proxy(req)
    expect(result.status).toBe(401)
    expect(result.body).toEqual({ error: 'Unauthorized' })
    expect(result.headers.get('WWW-Authenticate')).toBeUndefined()
  })

  it('should allow access with a valid session cookie', async () => {
    const secret = getAppSecret('testpassword123')
    const validToken = createAppSessionToken('testuser', secret)
    const req = createMockRequest('/', validToken)

    const result = await proxy(req)
    expect(result).toEqual({ status: 200, type: 'next' })
  })

  it('should redirect authenticated users from /login to /', async () => {
    const secret = getAppSecret('testpassword123')
    const validToken = createAppSessionToken('testuser', secret)
    const req = createMockRequest('/login', validToken)

    const result: any = await proxy(req)
    expect(result.type).toBe('redirect')
    expect(result.url).toBe('http://localhost:3000/')
  })

  it('should redirect authenticated users from /login to redirect parameter if specified', async () => {
    const secret = getAppSecret('testpassword123')
    const validToken = createAppSessionToken('testuser', secret)
    const req = createMockRequest('/login?redirect=%2Fstudy', validToken)

    const result: any = await proxy(req)
    expect(result.type).toBe('redirect')
    expect(result.url).toBe('http://localhost:3000/study')
  })

  it('should prevent open redirect when redirect param is an external or protocol-relative URL', async () => {
    const secret = getAppSecret('testpassword123')
    const validToken = createAppSessionToken('testuser', secret)

    const maliciousUrls = [
      '//evil.com',
      '//evil.com/phishing',
      '/\\evil.com',
      'https://evil.com',
      'http://evil.com',
      '/login',
    ]

    for (const evil of maliciousUrls) {
      const req = createMockRequest(`/login?redirect=${encodeURIComponent(evil)}`, validToken)
      const result: any = await proxy(req)
      expect(result.type).toBe('redirect')
      expect(result.url).toBe('http://localhost:3000/')
    }
  })

  it('should reject invalid session tokens and redirect to /login', async () => {
    const req = createMockRequest('/', 'invalid.token')
    const result: any = await proxy(req)
    expect(result.type).toBe('redirect')
    expect(result.url).toBe('http://localhost:3000/login')
  })

  it('should reject expired session tokens', async () => {
    const secret = getAppSecret('testpassword123')
    // Create token expired 10 seconds ago
    const expiredToken = createAppSessionToken('testuser', secret, -10)
    const req = createMockRequest('/', expiredToken)

    const result: any = await proxy(req)
    expect(result.type).toBe('redirect')
    expect(result.url).toBe('http://localhost:3000/login')
  })

  it('should reject session tokens signed with wrong secret', async () => {
    const wrongSecretToken = createAppSessionToken('testuser', 'wrong-secret')
    const req = createMockRequest('/', wrongSecretToken)

    const result: any = await proxy(req)
    expect(result.type).toBe('redirect')
    expect(result.url).toBe('http://localhost:3000/login')
  })

  it('should reject session tokens for different user', async () => {
    const secret = getAppSecret('testpassword123')
    const otherUserToken = createAppSessionToken('otheruser', secret)
    const req = createMockRequest('/', otherUserToken)

    const result: any = await proxy(req)
    expect(result.type).toBe('redirect')
    expect(result.url).toBe('http://localhost:3000/login')
  })

  it('should fallback to BASIC_AUTH_USER and BASIC_AUTH_PASSWORD if AUTH_USER/AUTH_PASSWORD are not set', async () => {
    delete process.env.AUTH_USER
    delete process.env.AUTH_PASSWORD
    process.env.BASIC_AUTH_USER = 'legacyuser'
    process.env.BASIC_AUTH_PASSWORD = 'legacypassword'

    const secret = getAppSecret('legacypassword')
    const validToken = createAppSessionToken('legacyuser', secret)
    const req = createMockRequest('/', validToken)

    const result = await proxy(req)
    expect(result).toEqual({ status: 200, type: 'next' })
  })

  describe('Notification API Token for Home Assistant', () => {
    beforeEach(() => {
      process.env.NOTIFICATION_API_TOKEN = 'secret-ha-token'
    })

    it('allows /api/notifications/due-count with valid Bearer token', async () => {
      const url = new URL('/api/notifications/due-count', 'http://localhost:3000')
      const req = {
        url: url.toString(),
        nextUrl: url,
        headers: {
          get: (name: string) => name.toLowerCase() === 'authorization' ? 'Bearer secret-ha-token' : null,
        },
        cookies: { get: () => undefined },
      } as unknown as NextRequest

      const result = await proxy(req)
      expect(result).toEqual({ status: 200, type: 'next' })
    })

    it('allows /api/notifications/due-count with valid ?token= query parameter', async () => {
      const url = new URL('/api/notifications/due-count?token=secret-ha-token', 'http://localhost:3000')
      const req = {
        url: url.toString(),
        nextUrl: url,
        headers: {
          get: () => null,
        },
        cookies: { get: () => undefined },
      } as unknown as NextRequest

      const result = await proxy(req)
      expect(result).toEqual({ status: 200, type: 'next' })
    })

    it('rejects /api/notifications/due-count with 401 when token is invalid', async () => {
      const url = new URL('/api/notifications/due-count?token=wrong-token', 'http://localhost:3000')
      const req = {
        url: url.toString(),
        nextUrl: url,
        headers: {
          get: () => null,
        },
        cookies: { get: () => undefined },
      } as unknown as NextRequest

      const result: any = await proxy(req)
      expect(result.status).toBe(401)
      expect(result.type).toBe('json')
    })
  })
})
