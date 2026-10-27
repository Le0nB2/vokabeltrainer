import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getSetupState,
  completeSetupSingleUser,
  completeSetupProtected,
} from '../src/actions/setup'
import {
  checkPassword,
  getSettingsProtection,
  isSettingsPasswordConfigured,
  updateSettingsPasswordAction,
  loginApp,
} from '../src/actions/auth'
import {
  AUTH_COOKIE_NAME,
  SETTINGS_COOKIE_NAME,
  hashPassword,
} from '../src/lib/auth-utils'
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

describe('Setup Wizard & Kindersicherung Settings Password', () => {
  const originalEnv = process.env

  beforeEach(() => {
    resetAllRateLimits()
    process.env = { ...originalEnv }
    delete process.env.AUTH_USER
    delete process.env.AUTH_PASSWORD
    delete process.env.BASIC_AUTH_USER
    delete process.env.BASIC_AUTH_PASSWORD
    delete process.env.SETTINGS_PASSWORD
    delete process.env.ADMIN_PASSWORD
    delete process.env.RESET_ADMIN_PASSWORD
    mockCookies.clear()
    mockHeaders.clear()
    vi.restoreAllMocks()
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      if (typeof cb === 'function') return cb(prisma)
      return Promise.all(cb)
    })
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  describe('getSetupState', () => {
    it('returns needsSetup: true for a fresh database without environment auth', async () => {
      vi.spyOn(prisma.user, 'count').mockResolvedValue(0)
      vi.spyOn(prisma.settings, 'findUnique').mockResolvedValue(null)

      const state = await getSetupState()
      expect(state.needsSetup).toBe(true)
    })

    it('returns needsSetup: false when environment credentials are set (backwards compatibility)', async () => {
      process.env.AUTH_USER = 'admin'
      process.env.AUTH_PASSWORD = 'password123'
      const state = await getSetupState()
      expect(state.needsSetup).toBe(false)
    })

    it('returns needsSetup: false when an admin user exists in DB', async () => {
      ;(vi.spyOn(prisma.user, 'count') as any).mockImplementation(async (args: any) => {
        if (args?.where?.role === 'ADMIN') return 1
        return 1
      })

      const state = await getSetupState()
      expect(state.needsSetup).toBe(false)
    })

    it('returns needsSetup: false when single-user mode was completed in settings', async () => {
      vi.spyOn(prisma.user, 'count').mockResolvedValue(0)
      vi.spyOn(prisma.settings, 'findUnique').mockResolvedValue({
        id: 'default',
        isSetupCompleted: true,
      } as any)

      const state = await getSetupState()
      expect(state.needsSetup).toBe(false)
    })
  })

  describe('completeSetupSingleUser', () => {
    it('marks setup completed in settings', async () => {
      const upsertSpy = vi.spyOn(prisma.settings, 'upsert').mockResolvedValue({
        id: 'default',
        isSetupCompleted: true,
      } as any)

      const res = await completeSetupSingleUser()
      expect(res.success).toBe(true)
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'default' },
          update: { isSetupCompleted: true },
        })
      )
    })
  })

  describe('completeSetupProtected', () => {
    it('prevents setup replay when setup is already completed', async () => {
      ;(vi.spyOn(prisma.user, 'count') as any).mockImplementation(async () => 1)

      const res1 = await completeSetupSingleUser()
      expect(res1.success).toBe(false)
      expect(res1.error).toContain('Ersteinrichtung wurde bereits abgeschlossen')

      const res2 = await completeSetupProtected({
        username: 'intruder',
        password: 'password123',
        settingsOption: 'same',
      })
      expect(res2.success).toBe(false)
      expect(res2.error).toContain('Ersteinrichtung wurde bereits abgeschlossen')
    })

    it('rejects short usernames and passwords', async () => {
      const res1 = await completeSetupProtected({
        username: 'a',
        password: 'Password123!',
        settingsOption: 'same',
      })
      expect(res1.success).toBe(false)
      expect(res1.error).toContain('Benutzername muss zwischen 2 und 50 Zeichen')

      const res2 = await completeSetupProtected({
        username: 'adminuser',
        password: '123',
        settingsOption: 'same',
      })
      expect(res2.success).toBe(false)
      expect(res2.error).toContain('mindestens 8 Zeichen')

      const res3 = await completeSetupProtected({
        username: 'adminuser',
        password: 'Password123',
        settingsOption: 'same',
      })
      expect(res3.success).toBe(false)
      expect(res3.error).toContain('Sonderzeichen')
    })

    it('creates admin user and sets settingsPasswordHash with same password', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null)
      const userCreateSpy = vi.spyOn(prisma.user, 'create').mockResolvedValue({
        id: 'admin-1',
        username: 'mama',
        role: 'ADMIN',
        isActive: true,
      } as any)
      vi.spyOn(prisma.deck, 'updateMany').mockResolvedValue({ count: 0 })
      const settingsUpsertSpy = vi.spyOn(prisma.settings, 'upsert').mockResolvedValue({
        id: 'default',
        isSetupCompleted: true,
      } as any)

      const res = await completeSetupProtected({
        username: 'mama',
        password: 'SecurePass123!',
        settingsOption: 'same',
      })
      expect(res.success).toBe(true)
      expect(userCreateSpy).toHaveBeenCalled()
      expect(settingsUpsertSpy).toHaveBeenCalled()
      expect(mockCookies.has(AUTH_COOKIE_NAME)).toBe(true)
    })

    it('creates admin user and sets custom PIN for Kindersicherung', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null)
      vi.spyOn(prisma.user, 'create').mockResolvedValue({
        id: 'admin-2',
        username: 'papa',
        role: 'ADMIN',
        isActive: true,
      } as any)
      vi.spyOn(prisma.deck, 'updateMany').mockResolvedValue({ count: 0 })
      const settingsUpsertSpy = vi.spyOn(prisma.settings, 'upsert').mockResolvedValue({
        id: 'default',
        isSetupCompleted: true,
      } as any)

      const res = await completeSetupProtected({
        username: 'papa',
        password: 'SecurePass123!',
        settingsOption: 'pin',
        customPin: '1234',
      })
      expect(res.success).toBe(true)
      expect(settingsUpsertSpy).toHaveBeenCalled()
    })
  })

  describe('Kindersicherung and checkPassword', () => {
    it('isSettingsPasswordConfigured returns true when DB hash exists', async () => {
      vi.spyOn(prisma.settings, 'findUnique').mockResolvedValue({
        id: 'default',
        settingsPasswordHash: hashPassword('4321'),
      } as any)

      const isConfigured = await isSettingsPasswordConfigured()
      expect(isConfigured).toBe(true)
    })

    it('isSettingsPasswordConfigured returns false when settingsPasswordHash is disabled', async () => {
      vi.spyOn(prisma.settings, 'findUnique').mockResolvedValue({
        id: 'default',
        settingsPasswordHash: 'disabled',
      } as any)

      const isConfigured = await isSettingsPasswordConfigured()
      expect(isConfigured).toBe(false)
    })

    it('checkPassword unlocks with correct PIN', async () => {
      vi.spyOn(prisma.settings, 'findUnique').mockResolvedValue({
        id: 'default',
        settingsPasswordHash: hashPassword('9876'),
      } as any)

      const res = await checkPassword('9876')
      expect(res.success).toBe(true)
      expect(mockCookies.has(SETTINGS_COOKIE_NAME)).toBe(true)
    })

    it('checkPassword unlocks with parent/admin account password (emergency unlock)', async () => {
      vi.spyOn(prisma.settings, 'findUnique').mockResolvedValue({
        id: 'default',
        settingsPasswordHash: hashPassword('KindersicherungPin4444'),
      } as any)

      vi.spyOn(prisma.user, 'findMany').mockResolvedValue([
        {
          id: 'admin-user-id',
          passwordHash: hashPassword('MasterElternPasswort123'),
        } as any,
      ])

      const res = await checkPassword('MasterElternPasswort123')
      expect(res.success).toBe(true)
      expect(mockCookies.has(SETTINGS_COOKIE_NAME)).toBe(true)
    })

    it('checkPassword rejects wrong password', async () => {
      vi.spyOn(prisma.settings, 'findUnique').mockResolvedValue({
        id: 'default',
        settingsPasswordHash: hashPassword('9876'),
      } as any)
      vi.spyOn(prisma.user, 'findMany').mockResolvedValue([])

      const res = await checkPassword('wrong')
      expect(res.success).toBe(false)
      expect(res.error).toBe('Falsches Passwort')
    })
  })

  describe('updateSettingsPasswordAction', () => {
    it('updates PIN and can disable protection', async () => {
      let currentHash: string | null = hashPassword('initialPin')
      ;(vi.spyOn(prisma.settings, 'findUnique') as any).mockImplementation(async () => ({
        id: 'default',
        settingsPasswordHash: currentHash,
      }))

      ;(vi.spyOn(prisma.settings, 'upsert') as any).mockImplementation(async (args: any) => {
        currentHash = args.update.settingsPasswordHash
        return { id: 'default', settingsPasswordHash: currentHash }
      })

      // Unlock settings
      const unlockRes = await checkPassword('initialPin')
      expect(unlockRes.success).toBe(true)

      // Update to new PIN
      const updateRes = await updateSettingsPasswordAction({
        action: 'change',
        newPassword: 'newSecretPin',
      })
      expect(updateRes.success).toBe(true)

      // Disable protection
      const disableRes = await updateSettingsPasswordAction({
        action: 'disable',
      })
      expect(disableRes.success).toBe(true)
      expect(currentHash).toBe('disabled')
    })
  })

  describe('Emergency parent login override (ADMIN_PASSWORD)', () => {
    it('allows admin login using ADMIN_PASSWORD env variable and syncs DB hash', async () => {
      process.env.ADMIN_PASSWORD = 'EmergencyResetPassword999'

      vi.spyOn(prisma.user, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.user, 'findFirst').mockResolvedValue({
        id: 'admin-id',
        username: 'eltern',
        role: 'ADMIN',
      } as any)

      const updateSpy = vi.spyOn(prisma.user, 'update').mockResolvedValue({} as any)

      const loginRes = await loginApp({
        username: 'eltern',
        password: 'EmergencyResetPassword999',
      })
      expect(loginRes.success).toBe(true)
      expect(mockCookies.has(AUTH_COOKIE_NAME)).toBe(true)
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'admin-id' },
          data: expect.objectContaining({
            lastLoginAt: expect.any(Date),
          }),
        })
      )
    })
  })
})
