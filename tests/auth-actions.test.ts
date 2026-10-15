import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loginApp, logoutApp, isAppAuthRequired } from '../src/actions/auth'
import { AUTH_COOKIE_NAME, verifyAppSessionToken, getAppSecret } from '../src/lib/auth-utils'

const mockCookies = new Map<string, any>()

vi.mock('next/headers', () => {
  return {
    cookies: async () => ({
      get: (name: string) => mockCookies.get(name),
      set: (name: string, value: string, options: any) => {
        mockCookies.set(name, { name, value, ...options })
      },
      delete: (name: string) => {
        mockCookies.delete(name)
      },
    }),
    headers: async () => ({
      get: (name: string) => (name.toLowerCase() === 'x-forwarded-proto' ? 'https' : null),
    }),
  }
})

vi.mock('next/cache', () => {
  return {
    revalidatePath: vi.fn(),
  }
})

describe('auth server actions', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    process.env.AUTH_USER = 'admin'
    process.env.AUTH_PASSWORD = 'password123'
    delete process.env.BASIC_AUTH_USER
    delete process.env.BASIC_AUTH_PASSWORD
    mockCookies.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('isAppAuthRequired', () => {
    it('returns true when credentials are set', async () => {
      expect(await isAppAuthRequired()).toBe(true)
    })

    it('returns false when credentials are not set', async () => {
      delete process.env.AUTH_USER
      delete process.env.AUTH_PASSWORD
      expect(await isAppAuthRequired()).toBe(false)
    })
  })

  describe('loginApp', () => {
    it('successfully logs in with valid credentials and sets session cookie', async () => {
      const result = await loginApp({ username: 'admin', password: 'password123' })
      expect(result.success).toBe(true)

      const cookie = mockCookies.get(AUTH_COOKIE_NAME)
      expect(cookie).toBeDefined()
      expect(cookie.httpOnly).toBe(true)
      expect(cookie.sameSite).toBe('lax')

      const secret = getAppSecret('password123')
      const isValid = verifyAppSessionToken(cookie.value, 'admin', secret)
      expect(isValid).toBe(true)
    })

    it('rejects wrong password', async () => {
      const result = await loginApp({ username: 'admin', password: 'wrongpassword' })
      expect(result.success).toBe(false)
      expect(result.error).toBe('Ungültiger Benutzername oder falsches Passwort')
      expect(mockCookies.get(AUTH_COOKIE_NAME)).toBeUndefined()
    })

    it('rejects wrong username', async () => {
      const result = await loginApp({ username: 'intruder', password: 'password123' })
      expect(result.success).toBe(false)
      expect(result.error).toBe('Ungültiger Benutzername oder falsches Passwort')
      expect(mockCookies.get(AUTH_COOKIE_NAME)).toBeUndefined()
    })

    it('bypasses if auth is not configured', async () => {
      delete process.env.AUTH_USER
      delete process.env.AUTH_PASSWORD

      const result = await loginApp({ username: 'any', password: 'any' })
      expect(result.success).toBe(true)
    })
  })

  describe('logoutApp', () => {
    it('clears session cookie', async () => {
      mockCookies.set(AUTH_COOKIE_NAME, { value: 'existing-token' })
      const result = await logoutApp()
      expect(result.success).toBe(true)

      const cookie = mockCookies.get(AUTH_COOKIE_NAME)
      expect(cookie.value).toBe('')
      expect(cookie.maxAge).toBe(0)
    })
  })
})
