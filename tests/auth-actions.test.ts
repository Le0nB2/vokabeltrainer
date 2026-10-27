import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  loginApp,
  logoutApp,
  logoutSettings,
  isAppAuthRequired,
  isSettingsPasswordConfigured,
  checkPassword,
} from '../src/actions/auth'
import {
  AUTH_COOKIE_NAME,
  SETTINGS_COOKIE_NAME,
  verifyAppSessionToken,
  verifySettingsSessionToken,
  createAppSessionToken,
  getPasswordVersion,
  getAppSecret,
  hashPassword,
} from '../src/lib/auth-utils'
import { getCurrentUser } from '../src/lib/auth-guard'
import prisma from '../src/lib/prisma'
import { resetAllRateLimits } from '../src/lib/rate-limit'

if (!globalThis.__mockCookies) globalThis.__mockCookies = new Map()
if (!globalThis.__mockHeaders) globalThis.__mockHeaders = new Map()
const mockCookies = globalThis.__mockCookies
const mockHeaders = globalThis.__mockHeaders

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
      get: (name: string) => {
        const lower = name.toLowerCase()
        if (mockHeaders.has(lower)) {
          return mockHeaders.get(lower)
        }
        return lower === 'x-forwarded-proto' ? 'https' : null
      },
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
    resetAllRateLimits()
    process.env = { ...originalEnv }
    process.env.AUTH_USER = 'admin'
    process.env.AUTH_PASSWORD = 'password123'
    process.env.SETTINGS_PASSWORD = 'secretsettings'
    delete process.env.BASIC_AUTH_USER
    delete process.env.BASIC_AUTH_PASSWORD
    mockCookies.clear()
    mockHeaders.clear()
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

    describe('rate limiting (SEC-03)', () => {
      it('blocks IP after 5 failed login attempts', async () => {
        mockHeaders.set('x-forwarded-for', '192.168.1.100')

        // 5 failed attempts
        for (let i = 0; i < 5; i++) {
          const res = await loginApp({ username: 'admin', password: 'wrong' })
          expect(res.success).toBe(false)
          expect(res.error).toBe('Ungültiger Benutzername oder falsches Passwort')
        }

        // 6th attempt should be blocked immediately by rate limit
        const blockedRes = await loginApp({ username: 'admin', password: 'password123' })
        expect(blockedRes.success).toBe(false)
        expect(blockedRes.error).toContain('Zu viele Fehlversuche')
      })

      it('isolates rate limiting between different client IPs', async () => {
        mockHeaders.set('x-forwarded-for', '10.0.0.1')
        for (let i = 0; i < 5; i++) {
          await loginApp({ username: 'admin', password: 'wrong' })
        }
        // 10.0.0.1 is blocked
        const blocked = await loginApp({ username: 'admin', password: 'password123' })
        expect(blocked.success).toBe(false)
        expect(blocked.error).toContain('Zu viele Fehlversuche')

        // 10.0.0.2 is unaffected and can login
        mockHeaders.set('x-forwarded-for', '10.0.0.2')
        const allowed = await loginApp({ username: 'admin', password: 'password123' })
        expect(allowed.success).toBe(true)
      })

      it('resets rate limit on successful login', async () => {
        mockHeaders.set('x-forwarded-for', '192.168.1.200')

        // 3 failed attempts
        for (let i = 0; i < 3; i++) {
          await loginApp({ username: 'admin', password: 'wrong' })
        }

        // Successful login
        const loginRes = await loginApp({ username: 'admin', password: 'password123' })
        expect(loginRes.success).toBe(true)

        // User can fail again up to 5 times without being blocked immediately
        for (let i = 0; i < 4; i++) {
          const res = await loginApp({ username: 'admin', password: 'wrong' })
          expect(res.error).toBe('Ungültiger Benutzername oder falsches Passwort')
        }
      })

      it('blocks account after 10 failed login attempts across different IPs (anti-distributed brute force)', async () => {
        // 2 different IPs, 5 failed attempts each = 10 attempts for 'admin'
        for (let ip = 1; ip <= 2; ip++) {
          mockHeaders.set('x-forwarded-for', `10.0.1.${ip}`)
          for (let attempt = 0; attempt < 5; attempt++) {
            const res = await loginApp({ username: 'admin', password: 'wrong' })
            expect(res.success).toBe(false)
          }
        }

        // A new 3rd IP attempts to log in as 'admin' with correct password -> blocked by user limit
        mockHeaders.set('x-forwarded-for', '10.0.1.99')
        const blockedRes = await loginApp({ username: 'admin', password: 'password123' })
        expect(blockedRes.success).toBe(false)
        expect(blockedRes.error).toContain('Zu viele Fehlversuche für diesen Benutzer')
      }, 15000)
    })
  })

  describe('checkPassword', () => {
    it('accepts correct password and sets settings_auth cookie', async () => {
      const res = await checkPassword('secretsettings')
      expect(res.success).toBe(true)
      const cookie = mockCookies.get(SETTINGS_COOKIE_NAME)
      expect(cookie).toBeDefined()
      expect(verifySettingsSessionToken(cookie.value, 'secretsettings')).toBe(true)
    })

    it('rejects wrong password', async () => {
      const res = await checkPassword('wrongsettings')
      expect(res.success).toBe(false)
      expect(res.error).toBe('Falsches Passwort')
    })

    it('blocks after 5 failed password attempts', async () => {
      mockHeaders.set('x-forwarded-for', '192.168.1.50')
      for (let i = 0; i < 5; i++) {
        const res = await checkPassword('wrong')
        expect(res.success).toBe(false)
        expect(res.error).toBe('Falsches Passwort')
      }

      // 6th attempt should be blocked
      const blockedRes = await checkPassword('secretsettings')
      expect(blockedRes.success).toBe(false)
      expect(blockedRes.error).toContain('Zu viele Fehlversuche')
    })
  })

  describe('isSettingsPasswordConfigured', () => {
    it('returns true when SETTINGS_PASSWORD is set', async () => {
      process.env.SETTINGS_PASSWORD = 'some-password'
      expect(await isSettingsPasswordConfigured()).toBe(true)
    })

    it('returns false when SETTINGS_PASSWORD is not set', async () => {
      delete process.env.SETTINGS_PASSWORD
      expect(await isSettingsPasswordConfigured()).toBe(false)
    })
  })

  describe('logoutApp', () => {
    it('clears auth and settings session cookies with sameSite lax', async () => {
      mockCookies.set(AUTH_COOKIE_NAME, { value: 'existing-token' })
      mockCookies.set(SETTINGS_COOKIE_NAME, { value: 'existing-settings-token' })
      const result = await logoutApp()
      expect(result.success).toBe(true)

      const authCookie = mockCookies.get(AUTH_COOKIE_NAME)
      expect(authCookie.value).toBe('')
      expect(authCookie.maxAge).toBe(0)
      expect(authCookie.sameSite).toBe('lax')

      const settingsCookie = mockCookies.get(SETTINGS_COOKIE_NAME)
      expect(settingsCookie.value).toBe('')
      expect(settingsCookie.maxAge).toBe(0)
      expect(settingsCookie.sameSite).toBe('lax')
    })
  })

  describe('logoutSettings', () => {
    it('clears only settings session cookie and keeps auth cookie intact', async () => {
      mockCookies.set(AUTH_COOKIE_NAME, { value: 'existing-app-token' })
      mockCookies.set(SETTINGS_COOKIE_NAME, { value: 'existing-settings-token' })
      const result = await logoutSettings()
      expect(result.success).toBe(true)

      // App auth cookie remains intact
      const authCookie = mockCookies.get(AUTH_COOKIE_NAME)
      expect(authCookie.value).toBe('existing-app-token')

      // Settings cookie is cleared
      const settingsCookie = mockCookies.get(SETTINGS_COOKIE_NAME)
      expect(settingsCookie.value).toBe('')
      expect(settingsCookie.maxAge).toBe(0)
      expect(settingsCookie.sameSite).toBe('lax')
    })
  })

  describe('SEC-10: Cookie Secure Flag Handling', () => {
    beforeEach(() => {
      delete process.env.COOKIE_SECURE
      mockHeaders.clear()
    })

    it('sets secure: true on login when x-forwarded-proto contains https', async () => {
      mockHeaders.set('x-forwarded-proto', 'https, http')
      const result = await loginApp({ username: 'admin', password: 'password123' })
      expect(result.success).toBe(true)
      const cookie = mockCookies.get(AUTH_COOKIE_NAME)
      expect(cookie.secure).toBe(true)
    })

    it('sets secure: false on login when request is plain http', async () => {
      mockHeaders.set('x-forwarded-proto', 'http')
      const result = await loginApp({ username: 'admin', password: 'password123' })
      expect(result.success).toBe(true)
      const cookie = mockCookies.get(AUTH_COOKIE_NAME)
      expect(cookie.secure).toBe(false)
    })

    it('forces secure: true when COOKIE_SECURE=true is configured', async () => {
      process.env.COOKIE_SECURE = 'true'
      mockHeaders.set('x-forwarded-proto', 'http')
      const result = await loginApp({ username: 'admin', password: 'password123' })
      expect(result.success).toBe(true)
      const cookie = mockCookies.get(AUTH_COOKIE_NAME)
      expect(cookie.secure).toBe(true)
    })

    it('forces secure: false when COOKIE_SECURE=false is configured for local setups', async () => {
      process.env.COOKIE_SECURE = 'false'
      mockHeaders.set('x-forwarded-proto', 'https')
      const result = await loginApp({ username: 'admin', password: 'password123' })
      expect(result.success).toBe(true)
      const cookie = mockCookies.get(AUTH_COOKIE_NAME)
      expect(cookie.secure).toBe(false)
    })

    it('sets secure: true on checkPassword when https is detected', async () => {
      mockHeaders.set('x-forwarded-proto', 'https')
      const result = await checkPassword('secretsettings')
      expect(result.success).toBe(true)
      const cookie = mockCookies.get(SETTINGS_COOKIE_NAME)
      expect(cookie.secure).toBe(true)
    })

    it('sets secure: false on checkPassword when plain http is detected', async () => {
      mockHeaders.set('x-forwarded-proto', 'http')
      const result = await checkPassword('secretsettings')
      expect(result.success).toBe(true)
      const cookie = mockCookies.get(SETTINGS_COOKIE_NAME)
      expect(cookie.secure).toBe(false)
    })
  })

  describe('Database User Authentication', () => {
    it('authenticates a valid database user', async () => {
      const hash = hashPassword('childPassword123')
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: 'user-anna-id',
        username: 'anna',
        displayName: 'Anna',
        passwordHash: hash,
        role: 'USER',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null,
      } as any)
      vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({} as any)

      const result = await loginApp({ username: 'anna', password: 'childPassword123' })
      expect(result.success).toBe(true)
      const cookie = mockCookies.get(AUTH_COOKIE_NAME)
      expect(cookie).toBeDefined()
    })

    it('rejects database user with wrong password', async () => {
      const hash = hashPassword('childPassword123')
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: 'user-anna-id',
        username: 'anna',
        displayName: 'Anna',
        passwordHash: hash,
        role: 'USER',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null,
      } as any)

      const result = await loginApp({ username: 'anna', password: 'wrongPassword' })
      expect(result.success).toBe(false)
      expect(result.error).toBe('Ungültiger Benutzername oder falsches Passwort')
    })

    it('rejects deactivated database user', async () => {
      const hash = hashPassword('childPassword123')
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: 'user-anna-id',
        username: 'anna',
        displayName: 'Anna',
        passwordHash: hash,
        role: 'USER',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null,
      } as any)

      const result = await loginApp({ username: 'anna', password: 'childPassword123' })
      expect(result.success).toBe(false)
      expect(result.error).toContain('deaktiviert')
    })

    it('revokes active session when database user password has changed', async () => {
      const initialHash = hashPassword('oldPassword123!')
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: 'user-anna-id',
        username: 'anna',
        displayName: 'Anna',
        passwordHash: initialHash,
        role: 'USER',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null,
      } as any)
      vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({} as any)

      // 1. Log in -> sets valid cookie with correct secret and pv
      const loginRes = await loginApp({ username: 'anna', password: 'oldPassword123!' })
      expect(loginRes.success).toBe(true)

      // 2. Initial password matches -> valid session
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: 'user-anna-id',
        username: 'anna',
        role: 'USER',
        isActive: true,
        passwordHash: initialHash,
      } as any)

      const user1 = await getCurrentUser()
      expect(user1).not.toBeNull()
      expect(user1?.username).toBe('anna')

      // 3. Password changed in DB -> old session is revoked
      const updatedHash = hashPassword('newPassword456!')
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: 'user-anna-id',
        username: 'anna',
        role: 'USER',
        isActive: true,
        passwordHash: updatedHash,
      } as any)

      const user2 = await getCurrentUser()
      expect(user2).toBeNull()
    })
  })
})
