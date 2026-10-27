import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getUsers,
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
    expect(users[1].username).toBe('anna')
    expect(users[1].deckCount).toBe(2)
  })

  it('successfully creates a user with hashed password', async () => {
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

  it('rejects duplicate username', async () => {
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
    const res = await createUser({
      username: 'admin',
      password: 'mypassword123',
    })

    expect(res.success).toBe(false)
    expect(res.error).toContain('reserviert')
  })

  it('deletes a user and prevents deleting the system admin', async () => {
    const deleteSpy = vi.spyOn(prisma.user, 'delete').mockResolvedValueOnce({} as any)

    // Cannot delete env-admin
    const adminRes = await deleteUser('env-admin')
    expect(adminRes.success).toBe(false)
    expect(deleteSpy).not.toHaveBeenCalled()

    // Can delete normal user
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

  it('toggles user active status', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
      id: 'u-123',
      isActive: true,
    } as any)
    const updateSpy = vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({} as any)

    const res = await toggleUserActive('u-123')
    expect(res.success).toBe(true)
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'u-123' },
      data: { isActive: false },
    })
  })
})
