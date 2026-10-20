import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AUTH_COOKIE_NAME, createAppSessionToken, getAppSecret } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'

vi.mock('@/lib/prisma', () => {
  return {
    default: {
      settings: {
        findUnique: vi.fn(),
      },
      card: {
        count: vi.fn(),
      },
    },
  }
})

class MockNextRequest {
  public headers: Headers
  public nextUrl: URL

  constructor(url = 'http://localhost:3000/api/notifications/due-count', headers = new Headers()) {
    this.nextUrl = new URL(url)
    this.headers = headers
  }
}

describe('GET /api/notifications/due-count (Home Assistant Token & Auth)', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.AUTH_USER
    delete process.env.AUTH_PASSWORD
    delete process.env.NOTIFICATION_API_TOKEN

    if (globalThis.__mockCookies) {
      globalThis.__mockCookies.clear()
    }

    vi.clearAllMocks()

    vi.mocked(prisma.settings.findUnique).mockResolvedValue({
      id: 'default',
      notificationsEnabled: true,
    } as any)

    vi.mocked(prisma.card.count).mockResolvedValue(7)
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('allows access in single-user mode (no credentials in env)', async () => {
    const { GET } = await import('@/app/api/notifications/due-count/route')
    const req = new MockNextRequest() as any
    const res = await GET(req)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.dueCount).toBe(7)
  })

  it('returns 0 when notifications are disabled in settings', async () => {
    vi.mocked(prisma.settings.findUnique).mockResolvedValueOnce({
      id: 'default',
      notificationsEnabled: false,
    } as any)

    const { GET } = await import('@/app/api/notifications/due-count/route')
    const req = new MockNextRequest() as any
    const res = await GET(req)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.dueCount).toBe(0)
  })

  describe('When Auth is configured', () => {
    beforeEach(() => {
      process.env.AUTH_USER = 'admin'
      process.env.AUTH_PASSWORD = 'apppassword'
      process.env.NOTIFICATION_API_TOKEN = 'ha-secret-token-123'
    })

    it('rejects unauthenticated request with 401 when no token is sent', async () => {
      const { GET } = await import('@/app/api/notifications/due-count/route')
      const req = new MockNextRequest() as any
      const res = await GET(req)

      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('rejects request with 401 when wrong token is sent', async () => {
      const { GET } = await import('@/app/api/notifications/due-count/route')
      const headers = new Headers({ authorization: 'Bearer wrong-token' })
      const req = new MockNextRequest('http://localhost:3000/api/notifications/due-count', headers) as any
      const res = await GET(req)

      expect(res.status).toBe(401)
    })

    it('allows access with valid Bearer token in Authorization header', async () => {
      const { GET } = await import('@/app/api/notifications/due-count/route')
      const headers = new Headers({ authorization: 'Bearer ha-secret-token-123' })
      const req = new MockNextRequest('http://localhost:3000/api/notifications/due-count', headers) as any
      const res = await GET(req)

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.dueCount).toBe(7)
    })

    it('allows access with valid token in query param (?token=...) ', async () => {
      const { GET } = await import('@/app/api/notifications/due-count/route')
      const req = new MockNextRequest('http://localhost:3000/api/notifications/due-count?token=ha-secret-token-123') as any
      const res = await GET(req)

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.dueCount).toBe(7)
    })

    it('allows access when user is authenticated via app session cookie', async () => {
      const secret = getAppSecret('apppassword')
      const token = createAppSessionToken('admin', secret, 3600)
      globalThis.__mockCookies.set(AUTH_COOKIE_NAME, { value: token })

      const { GET } = await import('@/app/api/notifications/due-count/route')
      const req = new MockNextRequest() as any
      const res = await GET(req)

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.dueCount).toBe(7)
    })
  })
})
