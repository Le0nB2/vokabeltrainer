import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  setupFamilySystem,
  changeUserRole,
} from '../src/actions/users'
import {
  getAssignableUsers,
  transferDeck,
} from '../src/actions/decks'
import {
  SETTINGS_COOKIE_NAME,
  createSettingsSessionToken,
  createAppSessionToken,
  AUTH_COOKIE_NAME,
  getAppSecret,
  verifyPassword,
} from '../src/lib/auth-utils'
import prisma from '../src/lib/prisma'

if (!globalThis.__mockCookies) globalThis.__mockCookies = new Map()
const mockCookies = globalThis.__mockCookies

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
      get: () => '127.0.0.1',
    }),
  }
})

vi.mock('next/cache', () => {
  return {
    revalidatePath: vi.fn(),
  }
})

describe('Family Setup and Role Management', () => {
  const originalEnv = process.env

  beforeEach(() => {
    mockCookies.clear()
    process.env = { ...originalEnv }
    delete process.env.AUTH_USER
    delete process.env.AUTH_PASSWORD
    delete process.env.BASIC_AUTH_USER
    delete process.env.BASIC_AUTH_PASSWORD
    process.env.SETTINGS_PASSWORD = 'settingssecret'

    // Set valid settings session by default
    const settingsToken = createSettingsSessionToken('settingssecret')
    mockCookies.set(SETTINGS_COOKIE_NAME, { value: settingsToken })

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      if (typeof cb === 'function') return cb(prisma)
      return Promise.all(cb)
    })
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  describe('setupFamilySystem', () => {
    it('rejects call if settings auth is missing', async () => {
      mockCookies.delete(SETTINGS_COOKIE_NAME)
      const res = await setupFamilySystem({
        parentUsername: 'eltern',
        parentPassword: 'Password123!',
        childUsername: 'max',
        childPassword: 'ChildPassword123!',
      })
      expect(res.success).toBe(false)
      expect(res.error).toContain('Nicht autorisiert')
    })

    it('rejects if environment admin credentials are configured', async () => {
      process.env.AUTH_USER = 'envadmin'
      process.env.AUTH_PASSWORD = 'EnvPassword123!'
      const appToken = createAppSessionToken('envadmin', getAppSecret('EnvPassword123!'))
      mockCookies.set(AUTH_COOKIE_NAME, { value: appToken })

      const res = await setupFamilySystem({
        parentUsername: 'eltern',
        parentPassword: 'Password123!',
        childUsername: 'max',
        childPassword: 'ChildPassword123!',
      })
      expect(res.success).toBe(false)
      expect(res.error).toContain('Server-Umgebungsvariablen')
    })

    it('rejects if database admin already exists', async () => {
      vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce({
        id: 'existing-admin',
        username: 'papa',
        role: 'ADMIN',
      } as any)

      const res = await setupFamilySystem({
        parentUsername: 'eltern',
        parentPassword: 'Password123!',
        childUsername: 'max',
        childPassword: 'ChildPassword123!',
      })
      expect(res.success).toBe(false)
      expect(res.error).toContain('bereits ein Hauptnutzer')
    })

    it('validates password policy for both parent and child', async () => {
      vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(null)

      // Weak parent password
      let res = await setupFamilySystem({
        parentUsername: 'eltern',
        parentPassword: 'short',
        childUsername: 'max',
        childPassword: 'ChildPassword123!',
      })
      expect(res.success).toBe(false)
      expect(res.error).toContain('Eltern-Konto')

      // Weak child password
      vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(null)
      res = await setupFamilySystem({
        parentUsername: 'eltern',
        parentPassword: 'ParentPassword123!',
        childUsername: 'max',
        childPassword: 'short',
      })
      expect(res.success).toBe(false)
      expect(res.error).toContain('Kinder-Profil')
    })

    it('rejects identical username for parent and child', async () => {
      vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(null)
      const res = await setupFamilySystem({
        parentUsername: 'eltern',
        parentPassword: 'ParentPassword123!',
        childUsername: 'eltern',
        childPassword: 'ChildPassword123!',
      })
      expect(res.success).toBe(false)
      expect(res.error).toContain('unterschiedliche Benutzernamen')
    })

    it('successfully creates Parent (ADMIN) and Child (USER) and reassigns decks to Child', async () => {
      vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(null)
      vi.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([])

      const createdParent = {
        id: 'parent-id-123',
        username: 'eltern',
        displayName: 'Eltern',
        role: 'ADMIN',
        isActive: true,
        passwordHash: 'hash-parent',
      }
      const createdChild = {
        id: 'child-id-456',
        username: 'max',
        displayName: 'Max',
        role: 'USER',
        isActive: true,
        passwordHash: 'hash-child',
      }

      const createSpy = vi.spyOn(prisma.user, 'create')
        .mockResolvedValueOnce(createdParent as any)
        .mockResolvedValueOnce(createdChild as any)

      const updateManySpy = vi.spyOn(prisma.deck, 'updateMany').mockResolvedValueOnce({ count: 4 })
      vi.spyOn(prisma.settings, 'findUnique').mockResolvedValueOnce(null)
      const upsertSettingsSpy = vi.spyOn(prisma.settings, 'upsert').mockResolvedValueOnce({} as any)

      const res = await setupFamilySystem({
        parentUsername: 'eltern',
        parentPassword: 'ParentPassword123!',
        childUsername: 'max',
        childDisplayName: 'Max',
        childPassword: 'ChildPassword123!',
      })

      expect(res.success).toBe(true)
      expect(res.parentId).toBe('parent-id-123')
      expect(res.childId).toBe('child-id-456')

      // Verify Parent creation with ADMIN role
      expect(createSpy).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({
          username: 'eltern',
          role: 'ADMIN',
        }),
      })

      // Verify Child creation with USER role
      expect(createSpy).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          username: 'max',
          displayName: 'Max',
          role: 'USER',
        }),
      })

      // Crucial: Existing unassigned decks are assigned to the CHILD, NOT the parent!
      expect(updateManySpy).toHaveBeenCalledWith({
        where: {
          OR: [{ userId: null }, { userId: 'default' }, { userId: 'admin' }],
        },
        data: {
          userId: 'child-id-456',
        },
      })

      // Settings password hash updated with parent's password
      expect(upsertSettingsSpy).toHaveBeenCalled()
      const savedParentHash = createSpy.mock.calls[0][0].data.passwordHash
      expect(verifyPassword('ParentPassword123!', savedParentHash)).toBe(true)
    })
  })

  describe('changeUserRole', () => {
    it('rejects if caller is not an ADMIN', async () => {
      // Mock app session for normal USER
      const appSecret = getAppSecret()
      const token = createAppSessionToken('child-user', appSecret, 3600, {
        id: 'child-1',
        role: 'USER',
      })
      mockCookies.set(AUTH_COOKIE_NAME, { value: token })

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: 'child-1',
        username: 'child-user',
        role: 'USER',
        isActive: true,
      } as any)

      const res = await changeUserRole('user-2', 'ADMIN')
      expect(res.success).toBe(false)
      expect(res.error).toContain('Nur Administratoren')
    })

    it('prevents demoting the last active ADMIN', async () => {
      const appSecret = getAppSecret()
      const token = createAppSessionToken('admin', appSecret, 3600, {
        id: 'admin',
        role: 'ADMIN',
      })
      mockCookies.set(AUTH_COOKIE_NAME, { value: token })

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: 'admin-1',
        username: 'parent-admin',
        role: 'ADMIN',
        isActive: true,
      } as any)

      // Count of other admins is 0
      vi.spyOn(prisma.user, 'count').mockResolvedValueOnce(0)

      const res = await changeUserRole('admin-1', 'USER')
      expect(res.success).toBe(false)
      expect(res.error).toContain('Es muss mindestens ein aktives Eltern-/Administratorkonto')
    })

    it('allows demoting an ADMIN to USER when another active ADMIN exists', async () => {
      const appSecret = getAppSecret()
      const token = createAppSessionToken('admin', appSecret, 3600, {
        id: 'admin',
        role: 'ADMIN',
      })
      mockCookies.set(AUTH_COOKIE_NAME, { value: token })

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: 'admin-2',
        username: 'child-who-was-admin',
        role: 'ADMIN',
        isActive: true,
      } as any)

      // Another active admin exists
      vi.spyOn(prisma.user, 'count').mockResolvedValueOnce(1)
      const updateSpy = vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({
        id: 'admin-2',
        role: 'USER',
      } as any)

      const res = await changeUserRole('admin-2', 'USER')
      expect(res.success).toBe(true)
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: 'admin-2' },
        data: { role: 'USER' },
      })
    })

    it('allows promoting a USER to ADMIN', async () => {
      const appSecret = getAppSecret()
      const token = createAppSessionToken('admin', appSecret, 3600, {
        id: 'admin',
        role: 'ADMIN',
      })
      mockCookies.set(AUTH_COOKIE_NAME, { value: token })

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: 'user-2',
        username: 'anna',
        role: 'USER',
        isActive: true,
      } as any)

      const updateSpy = vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({
        id: 'user-2',
        role: 'ADMIN',
      } as any)

      const res = await changeUserRole('user-2', 'ADMIN')
      expect(res.success).toBe(true)
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: 'user-2' },
        data: { role: 'ADMIN' },
      })
    })
  })

  describe('Deck Transfer', () => {
    it('getAssignableUsers returns active users', async () => {
      vi.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([
        { id: 'u1', username: 'eltern', displayName: 'Eltern', role: 'ADMIN' },
        { id: 'u2', username: 'max', displayName: 'Max', role: 'USER' },
      ] as any)

      const users = await getAssignableUsers()
      expect(users.length).toBe(2)
      expect(users[0]).toEqual({
        id: 'u1',
        username: 'eltern',
        displayName: 'Eltern',
        role: 'ADMIN',
      })
    })

    it('transferDeck successfully transfers deck to another active user', async () => {
      const appSecret = getAppSecret()
      const token = createAppSessionToken('admin', appSecret, 3600, {
        id: 'admin',
        role: 'ADMIN',
      })
      mockCookies.set(AUTH_COOKIE_NAME, { value: token })

      vi.spyOn(prisma.deck, 'findUnique').mockResolvedValueOnce({
        id: 'deck-10',
        userId: 'admin',
      } as any)

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: 'child-2',
        username: 'leo',
        isActive: true,
      } as any)

      const updateSpy = vi.spyOn(prisma.deck, 'update').mockResolvedValueOnce({
        id: 'deck-10',
        userId: 'child-2',
      } as any)

      const res = await transferDeck('deck-10', 'child-2')
      expect(res.success).toBe(true)
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: 'deck-10' },
        data: { userId: 'child-2' },
      })
    })
  })
})
