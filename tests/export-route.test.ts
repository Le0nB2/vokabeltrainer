import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  AUTH_COOKIE_NAME,
  SETTINGS_COOKIE_NAME,
  createAppSessionToken,
  createSettingsSessionToken,
  getAppSecret,
} from '@/lib/auth-utils'
import prisma from '@/lib/prisma'

vi.mock('@/lib/prisma', () => {
  return {
    default: {
      settings: {
        findUnique: vi.fn(),
      },
      deck: {
        findMany: vi.fn(),
      },
    },
  }
})

describe('SEC-07: Backup-Export Route Protection (/api/export)', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.AUTH_USER
    delete process.env.AUTH_PASSWORD
    delete process.env.BASIC_AUTH_USER
    delete process.env.BASIC_AUTH_PASSWORD
    delete process.env.SETTINGS_PASSWORD

    if (globalThis.__mockCookies) {
      globalThis.__mockCookies.clear()
    }

    vi.clearAllMocks()

    // Default mock data
    vi.mocked(prisma.settings.findUnique).mockResolvedValue({
      id: 'default',
      minigamesEnabled: true,
    } as any)

    vi.mocked(prisma.deck.findMany).mockResolvedValue([
      {
        id: 'deck-1',
        name: 'Englisch',
        cards: [
          {
            id: 'card-1',
            front: 'hello',
            back: 'hallo',
            reviewLogs: [],
          },
        ],
        reviewLogs: [],
      },
    ] as any)
  })

  afterEach(() => {
    process.env = originalEnv
  })

  function setValidAppSession(user = 'testuser', pass = 'testpass') {
    const secret = getAppSecret(pass)
    const token = createAppSessionToken(user, secret, 3600)
    globalThis.__mockCookies.set(AUTH_COOKIE_NAME, { value: token })
  }

  function setValidSettingsSession(password = 'settingspass') {
    const token = createSettingsSessionToken(password, 3600)
    globalThis.__mockCookies.set(SETTINGS_COOKIE_NAME, { value: token })
  }

  describe('Single-User / Local Mode (no credentials in .env)', () => {
    it('rejects GET export with 405 Method Not Allowed (AUDIT-05 CSRF protection)', async () => {
      const { GET } = await import('@/app/api/export/route')
      const response = await GET()

      expect(response.status).toBe(405)
      const data = await response.json()
      expect(data.error).toContain('Method Not Allowed')
      expect(response.headers.get('Allow')).toBe('POST')
    })

    it('allows POST export without any login or cookies', async () => {
      const { POST } = await import('@/app/api/export/route')
      const response = await POST()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.version).toBe(2)
      expect(data.decks[0].name).toBe('Englisch')
      expect(response.headers.get('Content-Type')).toBe('application/json')
      expect(response.headers.get('Content-Disposition')).toContain('vokabeltrainer_export.json')
    })
  })

  describe('App Auth Configured (AUTH_USER / AUTH_PASSWORD in .env)', () => {
    beforeEach(() => {
      process.env.AUTH_USER = 'admin'
      process.env.AUTH_PASSWORD = 'supersecretpassword'
    })

    it('rejects GET export with 405 Method Not Allowed (AUDIT-05 CSRF protection)', async () => {
      const { GET } = await import('@/app/api/export/route')
      const response = await GET()

      expect(response.status).toBe(405)
      const data = await response.json()
      expect(data.error).toContain('Method Not Allowed')
    })

    it('rejects POST export with 401 when no auth cookie is present', async () => {
      const { POST } = await import('@/app/api/export/route')
      const response = await POST()

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('rejects POST export with 401 when auth cookie is invalid', async () => {
      globalThis.__mockCookies.set(AUTH_COOKIE_NAME, { value: 'invalid.token' })
      const { POST } = await import('@/app/api/export/route')
      const response = await POST()

      expect(response.status).toBe(401)
    })

    it('succeeds with 200 when valid app session cookie is provided', async () => {
      setValidAppSession('admin', 'supersecretpassword')
      const { POST } = await import('@/app/api/export/route')
      const response = await POST()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.version).toBe(2)
      expect(data.decks).toHaveLength(1)
    })
  })

  describe('Settings Password Configured (SETTINGS_PASSWORD in .env)', () => {
    beforeEach(() => {
      process.env.AUTH_USER = 'admin'
      process.env.AUTH_PASSWORD = 'supersecretpassword'
      process.env.SETTINGS_PASSWORD = 'settingssecret'
    })

    it('rejects with 401 when app session is valid but settings session is missing', async () => {
      setValidAppSession('admin', 'supersecretpassword')
      const { POST } = await import('@/app/api/export/route')
      const response = await POST()

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('rejects with 401 when settings session is invalid', async () => {
      setValidAppSession('admin', 'supersecretpassword')
      globalThis.__mockCookies.set(SETTINGS_COOKIE_NAME, { value: 'wrong.token' })
      const { POST } = await import('@/app/api/export/route')
      const response = await POST()

      expect(response.status).toBe(401)
    })

    it('succeeds with 200 when both app session and settings session are valid', async () => {
      setValidAppSession('admin', 'supersecretpassword')
      setValidSettingsSession('settingssecret')
      const { POST } = await import('@/app/api/export/route')
      const response = await POST()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.version).toBe(2)
      expect(data.decks).toHaveLength(1)
    })
  })

  describe('Error handling', () => {
    it('returns 500 when database query fails unexpectedly', async () => {
      vi.mocked(prisma.deck.findMany).mockRejectedValueOnce(new Error('DB failure'))
      const { POST } = await import('@/app/api/export/route')
      const response = await POST()

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Export failed')
    })
  })
})
