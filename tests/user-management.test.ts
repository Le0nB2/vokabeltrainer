import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getUsers,
  getUserManagementData,
  setupPrimaryAdmin,
  createUser,
  deleteUser,
  resetUserPassword,
  toggleUserActive,
} from '../src/actions/users'
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

describe('User Management Actions', () => {
  const originalEnv = process.env

  beforeEach(() => {
    mockCookies.clear()
    process.env = { ...originalEnv }
    process.env.AUTH_USER = 'admin'
    process.env.AUTH_PASSWORD = 'password123'
    process.env.SETTINGS_PASSWORD = 'settingssecret'

    // Set valid app session
    const appSecret = getAppSecret('password123')
    const appToken = createAppSessionToken('admin', appSecret)
    mockCookies.set(AUTH_COOKIE_NAME, { value: appToken })

    // Set valid settings session
    const settingsToken = createSettingsSessionToken('settingssecret')
    mockCookies.set(SETTINGS_COOKIE_NAME, { value: settingsToken })
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('blocks getUsers when settings auth is missing', async () => {
    mockCookies.delete(SETTINGS_COOKIE_NAME)
    await expect(getUsers()).rejects.toThrow('Nicht autorisiert')
  })

  it('returns users including env admin', async () => {
    vi.spyOn(prisma.deck, 'count').mockResolvedValueOnce(3)
    vi.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([
      {
        id: 'u-1',
        username: 'anna',
        displayName: 'Anna',
        role: 'USER',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null,
        _count: { decks: 2 },
      } as any,
    ])

    const users = await getUsers()
    expect(users.length).toBe(2)
    expect(users[0].username).toBe('admin')
    expect(users[0].isEnvUser).toBe(true)
    expect(users[0].isPrimaryAdmin).toBe(true)
    expect(users[1].username).toBe('anna')
    expect(users[1].deckCount).toBe(2)
  })

  it('returns hasPrimaryAdmin: false when neither env nor DB admin exists', async () => {
    delete process.env.AUTH_USER
    delete process.env.AUTH_PASSWORD
    delete process.env.BASIC_AUTH_USER
    delete process.env.BASIC_AUTH_PASSWORD

    vi.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([])
    const data = await getUserManagementData()
    expect(data.hasPrimaryAdmin).toBe(false)
    expect(data.primaryAdminType).toBeNull()
  })

  it('sets up a primary admin, assigns legacy decks, and sets session cookie', async () => {
    delete process.env.AUTH_USER
    delete process.env.AUTH_PASSWORD
    delete process.env.BASIC_AUTH_USER
    delete process.env.BASIC_AUTH_PASSWORD

    vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(null)
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(null)
    const createSpy = vi.spyOn(prisma.user, 'create').mockResolvedValueOnce({
      id: 'admin-db-1',
      username: 'eltern',
      role: 'ADMIN',
      displayName: 'Hauptnutzer',
      isActive: true,
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: null,
    })
    const updateManySpy = vi.spyOn(prisma.deck, 'updateMany').mockResolvedValueOnce({ count: 5 })

    const res = await setupPrimaryAdmin({
      username: 'eltern',
      password: 'mypassword123',
    })

    expect(res.success).toBe(true)
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          username: 'eltern',
          role: 'ADMIN',
        }),
      })
    )
    expect(updateManySpy).toHaveBeenCalledWith({
      where: {
        OR: [{ userId: null }, { userId: 'default' }, { userId: 'admin' }],
      },
      data: {
        userId: 'admin-db-1',
      },
    })
  })

  it('successfully creates a secondary user with hashed password', async () => {
    vi.spyOn(prisma.deck, 'count').mockResolvedValueOnce(3)
    vi.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([])
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(null)
    const createSpy = vi.spyOn(prisma.user, 'create').mockResolvedValueOnce({
      id: 'new-u-id',
      username: 'ben',
      displayName: 'Ben',
      passwordHash: 'hash',
      role: 'USER',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: null,
    })

    const res = await createUser({
      username: 'ben',
      password: 'mypassword123',
      displayName: 'Ben',
    })

    expect(res.success).toBe(true)
    expect(res.userId).toBe('new-u-id')
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          username: 'ben',
          role: 'USER',
        }),
      })
    )

    const savedHash = createSpy.mock.calls[0][0].data.passwordHash
    expect(verifyPassword('mypassword123', savedHash)).toBe(true)
  })

  it('prevents secondary user creation if no primary admin is configured', async () => {
    delete process.env.AUTH_USER
    delete process.env.AUTH_PASSWORD
    delete process.env.BASIC_AUTH_USER
    delete process.env.BASIC_AUTH_PASSWORD

    vi.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([])

    const res = await createUser({
      username: 'kind1',
      password: 'mypassword123',
    })

    expect(res.success).toBe(false)
    expect(res.error).toContain('Hauptnutzer')
  })

  it('rejects duplicate username', async () => {
    vi.spyOn(prisma.deck, 'count').mockResolvedValueOnce(3)
    vi.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([])
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
      id: 'existing-id',
      username: 'anna',
    } as any)

    const res = await createUser({
      username: 'anna',
      password: 'mypassword123',
    })

    expect(res.success).toBe(false)
    expect(res.error).toContain('existiert bereits')
  })

  it('rejects reserved admin username', async () => {
    vi.spyOn(prisma.deck, 'count').mockResolvedValueOnce(3)
    vi.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([])

    const res = await createUser({
      username: 'admin',
      password: 'mypassword123',
    })

    expect(res.success).toBe(false)
    expect(res.error).toContain('reserviert')
  })

  it('deletes a user and prevents deleting the primary admin', async () => {
    const deleteSpy = vi.spyOn(prisma.user, 'delete').mockResolvedValueOnce({} as any)

    // 1. Cannot delete env-admin (returns early without DB lookup)
    const adminRes = await deleteUser('env-admin')
    expect(adminRes.success).toBe(false)
    expect(deleteSpy).not.toHaveBeenCalled()

    // 2. Cannot delete DB admin
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
      id: 'db-admin-id',
      role: 'ADMIN',
    } as any)
    const dbAdminRes = await deleteUser('db-admin-id')
    expect(dbAdminRes.success).toBe(false)
    expect(deleteSpy).not.toHaveBeenCalled()

    // 3. Can delete normal user
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
      id: 'u-123',
      role: 'USER',
    } as any)
    const userRes = await deleteUser('u-123')
    expect(userRes.success).toBe(true)
    expect(deleteSpy).toHaveBeenCalledWith({ where: { id: 'u-123' } })
  })

  it('resets a user password', async () => {
    const updateSpy = vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({} as any)

    const res = await resetUserPassword('u-123', 'newpassword999')
    expect(res.success).toBe(true)
    expect(updateSpy).toHaveBeenCalled()
    const savedHash = updateSpy.mock.calls[0][0].data.passwordHash as string
    expect(verifyPassword('newpassword999', savedHash)).toBe(true)
  })

  it('toggles user active status and prevents deactivating primary admin', async () => {
    const updateSpy = vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({} as any)

    // 1. Primary env admin cannot be deactivated (returns early)
    const envRes = await toggleUserActive('env-admin')
    expect(envRes.success).toBe(false)

    // 2. Primary DB admin cannot be deactivated
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
      id: 'db-admin',
      isActive: true,
      role: 'ADMIN',
    } as any)
    const dbAdminRes = await toggleUserActive('db-admin')
    expect(dbAdminRes.success).toBe(false)

    // 3. Normal user can be toggled
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
      id: 'u-123',
      isActive: true,
      role: 'USER',
    } as any)
    const res = await toggleUserActive('u-123')
    expect(res.success).toBe(true)
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'u-123' },
      data: { isActive: false },
    })
  })
})
