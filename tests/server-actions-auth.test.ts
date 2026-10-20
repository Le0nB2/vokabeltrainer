import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { UnauthorizedError, requireAppAuth, isAppAuthenticated } from '../src/lib/auth-guard'
import {
  AUTH_COOKIE_NAME,
  createAppSessionToken,
  createSettingsSessionToken,
  getAppSecret,
} from '../src/lib/auth-utils'
import { getDecks, getDeckById, createDeck, deleteDeck, saveDeckResult } from '../src/actions/decks'
import {
  addCard,
  addCardsBulk,
  deleteCard,
  updateCardProgress,
  getAllDueCards,
  updateCardDetails,
  updateCardsEnrichmentBulk,
} from '../src/actions/cards'
import { getSettings, updateSettings, importData } from '../src/actions/settings'
import { getApiStats } from '../src/actions/api-stats'

const { mockCookies, mockPrisma } = vi.hoisted(() => {
  const cookies = new Map<string, any>()
  const prismaMock: any = {
    deck: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: 'deck-1', cards: [] }),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'deck-1', ...data })),
      delete: vi.fn().mockResolvedValue({ id: 'deck-1' }),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'deck-1', ...data })),
    },
    card: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({
        id: 'card-1',
        deckId: 'deck-1',
        box: 1,
        easeFactor: 2.5,
        lapses: 0,
        consecutiveCorrect: 0,
      }),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'card-1', ...data })),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      delete: vi.fn().mockResolvedValue({ id: 'card-1' }),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'card-1', ...data })),
    },
    reviewLog: {
      create: vi.fn().mockResolvedValue({ id: 'log-1' }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    settings: {
      findUnique: vi.fn().mockResolvedValue({ id: 'default', minigamesEnabled: true }),
      create: vi.fn().mockResolvedValue({ id: 'default', minigamesEnabled: true }),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'default', ...data })),
      upsert: vi.fn().mockResolvedValue({ id: 'default' }),
    },
    apiUsageLog: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn().mockImplementation((cb) => cb(prismaMock)),
  }
  return { mockCookies: cookies, mockPrisma: prismaMock }
})

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

vi.mock('@/lib/prisma', () => {
  return {
    default: mockPrisma,
  }
})

describe('SEC-02: Server Actions Authentication Protection', () => {
  const originalEnv = process.env

  beforeEach(() => {
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

  function setValidSessionCookie(user = 'admin', pass = 'password123') {
    const secret = getAppSecret(pass)
    const token = createAppSessionToken(user, secret, 3600)
    mockCookies.set(AUTH_COOKIE_NAME, { value: token })
  }

  describe('requireAppAuth guard function', () => {
    it('throws UnauthorizedError when auth is configured and no cookie is set', async () => {
      await expect(requireAppAuth()).rejects.toThrow(UnauthorizedError)
    })

    it('throws UnauthorizedError when token is invalid or expired', async () => {
      mockCookies.set(AUTH_COOKIE_NAME, { value: 'invalid-token' })
      await expect(requireAppAuth()).rejects.toThrow(UnauthorizedError)
    })

    it('does not throw when valid token cookie is present', async () => {
      setValidSessionCookie()
      await expect(requireAppAuth()).resolves.toBeUndefined()
    })

    it('bypasses authentication when AUTH_USER/AUTH_PASSWORD are not configured', async () => {
      delete process.env.AUTH_USER
      delete process.env.AUTH_PASSWORD
      await expect(requireAppAuth()).resolves.toBeUndefined()
    })
  })

  describe('isAppAuthenticated helper', () => {
    it('returns false when unauthenticated', async () => {
      expect(await isAppAuthenticated()).toBe(false)
    })

    it('returns true when valid session exists', async () => {
      setValidSessionCookie()
      expect(await isAppAuthenticated()).toBe(true)
    })

    it('returns true when auth is not configured', async () => {
      delete process.env.AUTH_USER
      delete process.env.AUTH_PASSWORD
      expect(await isAppAuthenticated()).toBe(true)
    })
  })

  describe('Decks Server Actions', () => {
    it('blocks getDecks when unauthenticated', async () => {
      await expect(getDecks()).rejects.toThrow(UnauthorizedError)
    })

    it('allows getDecks when authenticated', async () => {
      setValidSessionCookie()
      const decks = await getDecks()
      expect(decks).toEqual([])
      expect(mockPrisma.deck.findMany).toHaveBeenCalled()
    })

    it('blocks getDeckById when unauthenticated', async () => {
      await expect(getDeckById('deck-1')).rejects.toThrow(UnauthorizedError)
    })

    it('allows getDeckById when authenticated', async () => {
      setValidSessionCookie()
      const deck = await getDeckById('deck-1')
      expect(deck?.id).toBe('deck-1')
    })

    it('blocks createDeck when unauthenticated', async () => {
      await expect(createDeck('Englisch')).rejects.toThrow(UnauthorizedError)
      expect(mockPrisma.deck.create).not.toHaveBeenCalled()
    })

    it('allows createDeck when authenticated', async () => {
      setValidSessionCookie()
      const deck = await createDeck('Englisch', 'Vokabeln')
      expect(deck.title).toBe('Englisch')
      expect(mockPrisma.deck.create).toHaveBeenCalled()
    })

    it('blocks deleteDeck when unauthenticated', async () => {
      await expect(deleteDeck('deck-1')).rejects.toThrow(UnauthorizedError)
      expect(mockPrisma.deck.delete).not.toHaveBeenCalled()
    })

    it('allows deleteDeck when authenticated', async () => {
      setValidSessionCookie()
      await deleteDeck('deck-1')
      expect(mockPrisma.deck.delete).toHaveBeenCalledWith({ where: { id: 'deck-1' } })
    })

    it('blocks saveDeckResult when unauthenticated', async () => {
      await expect(saveDeckResult('deck-1', 5, 2)).rejects.toThrow(UnauthorizedError)
    })

    it('allows saveDeckResult when authenticated', async () => {
      setValidSessionCookie()
      const result = await saveDeckResult('deck-1', 5, 2)
      expect(result.lastResultCorrect).toBe(5)
    })
  })

  describe('Cards Server Actions', () => {
    it('blocks addCard when unauthenticated', async () => {
      await expect(addCard('deck-1', 'apple', 'Apfel')).rejects.toThrow(UnauthorizedError)
      expect(mockPrisma.card.create).not.toHaveBeenCalled()
    })

    it('allows addCard when authenticated', async () => {
      setValidSessionCookie()
      const card = await addCard('deck-1', 'apple', 'Apfel')
      expect(card.front).toBe('apple')
      expect(mockPrisma.card.create).toHaveBeenCalled()
    })

    it('blocks addCardsBulk when unauthenticated', async () => {
      await expect(
        addCardsBulk('deck-1', [{ front: 'sun', back: 'Sonne' }])
      ).rejects.toThrow(UnauthorizedError)
    })

    it('allows addCardsBulk when authenticated', async () => {
      setValidSessionCookie()
      const res = await addCardsBulk('deck-1', [{ front: 'sun', back: 'Sonne' }])
      expect(res.count).toBe(2)
    })

    it('blocks deleteCard when unauthenticated', async () => {
      await expect(deleteCard('card-1', 'deck-1')).rejects.toThrow(UnauthorizedError)
    })

    it('allows deleteCard when authenticated', async () => {
      setValidSessionCookie()
      await deleteCard('card-1', 'deck-1')
      expect(mockPrisma.card.delete).toHaveBeenCalledWith({ where: { id: 'card-1' } })
    })

    it('blocks updateCardProgress when unauthenticated', async () => {
      await expect(updateCardProgress('card-1', 'deck-1', 'good')).rejects.toThrow(UnauthorizedError)
    })

    it('allows updateCardProgress when authenticated', async () => {
      setValidSessionCookie()
      const res = await updateCardProgress('card-1', 'deck-1', 'good')
      expect(res.id).toBe('card-1')
    })

    it('blocks getAllDueCards when unauthenticated', async () => {
      await expect(getAllDueCards()).rejects.toThrow(UnauthorizedError)
    })

    it('allows getAllDueCards when authenticated', async () => {
      setValidSessionCookie()
      const cards = await getAllDueCards()
      expect(cards).toEqual([])
    })

    it('blocks updateCardDetails when unauthenticated', async () => {
      await expect(updateCardDetails('card-1', 'deck-1', 'a', 'b')).rejects.toThrow(UnauthorizedError)
    })

    it('allows updateCardDetails when authenticated', async () => {
      setValidSessionCookie()
      const updated = await updateCardDetails('card-1', 'deck-1', 'a', 'b')
      expect(updated.id).toBe('card-1')
    })

    it('blocks updateCardsEnrichmentBulk when unauthenticated', async () => {
      await expect(
        updateCardsEnrichmentBulk('deck-1', [{ id: 'card-1', gapText: '...' }])
      ).rejects.toThrow(UnauthorizedError)
    })

    it('allows updateCardsEnrichmentBulk when authenticated', async () => {
      setValidSessionCookie()
      await updateCardsEnrichmentBulk('deck-1', [{ id: 'card-1', gapText: '...' }])
      expect(mockPrisma.card.update).toHaveBeenCalled()
    })
  })

  describe('Settings & Stats Server Actions', () => {
    it('blocks getSettings when unauthenticated', async () => {
      await expect(getSettings()).rejects.toThrow(UnauthorizedError)
    })

    it('allows getSettings when authenticated', async () => {
      setValidSessionCookie()
      const settings = await getSettings()
      expect(settings.id).toBe('default')
    })

    it('blocks updateSettings when unauthenticated', async () => {
      await expect(updateSettings({ minigamesEnabled: false })).rejects.toThrow(UnauthorizedError)
    })

    it('blocks importData when unauthenticated', async () => {
      const res = await importData(JSON.stringify([{ title: 'Deck' }]))
      expect(res.success).toBe(false)
      expect(res.error).toContain('Nicht autorisiert')
    })

    it('blocks importData when payload exceeds 5 MB (SEC-05)', async () => {
      setValidSessionCookie()
      const hugeString = 'x'.repeat(5 * 1024 * 1024 + 1)
      const res = await importData(hugeString)
      expect(res.success).toBe(false)
      expect(res.error).toContain('Importdatei ist zu groß (maximal 5 MB erlaubt)')
    })

    it('blocks importData when JSON syntax is malformed (SEC-05)', async () => {
      setValidSessionCookie()
      const res = await importData('{ malformed: json :::')
      expect(res.success).toBe(false)
      expect(res.error).toContain('Ungültiges JSON-Format')
    })

    it('blocks importData when payload violates Zod schema (SEC-05)', async () => {
      setValidSessionCookie()
      const res = await importData(JSON.stringify([{ title: '' }]))
      expect(res.success).toBe(false)
      expect(res.error).toContain('Ungültige Daten in der Importdatei')
      expect(res.error).toContain('Deck-Titel darf nicht leer sein')
    })

    it('blocks importData when settings password is set but cookie is missing (SEC-05)', async () => {
      setValidSessionCookie()
      process.env.SETTINGS_PASSWORD = 'super-secret-settings'
      const res = await importData(JSON.stringify([{ title: 'Mein Deck' }]))
      expect(res.success).toBe(false)
      expect(res.error).toContain('Einstellungspasswort')
    })

    it('allows importData when fully authenticated and processes v2 payload (SEC-05)', async () => {
      setValidSessionCookie()
      process.env.SETTINGS_PASSWORD = 'super-secret-settings'
      const settingsToken = createSettingsSessionToken('super-secret-settings')
      mockCookies.set('settings_auth', { value: settingsToken })

      const payload = {
        version: 2,
        settings: { minigamesEnabled: false },
        decks: [
          {
            title: 'Latein',
            description: 'Lektion 1-5',
            cards: [
              {
                front: 'amare',
                back: 'lieben',
                box: 2,
                reviewLogs: [{ isCorrect: true }],
              },
            ],
          },
        ],
      }

      const res = await importData(JSON.stringify(payload))
      expect(res.success).toBe(true)
      expect(mockPrisma.$transaction).toHaveBeenCalled()
      expect(mockPrisma.deck.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: 'Latein', description: 'Lektion 1-5' }),
        })
      )
      expect(mockPrisma.card.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ front: 'amare', back: 'lieben', box: 2 }),
        })
      )
      expect(mockPrisma.reviewLog.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ isCorrect: true }),
          ]),
        })
      )
    })

    it('blocks getApiStats when unauthenticated', async () => {
      await expect(getApiStats()).rejects.toThrow(UnauthorizedError)
    })

    it('allows getApiStats when authenticated', async () => {
      setValidSessionCookie()
      const stats = await getApiStats()
      expect(Array.isArray(stats)).toBe(true)
    })
  })
})
