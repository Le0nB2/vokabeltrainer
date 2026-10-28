import { describe, it, expect } from 'vitest'
import {
  MAX_IMPORT_SIZE_BYTES,
  MAX_DECKS_PER_IMPORT,
  MAX_CARDS_PER_DECK,
  MAX_REVIEW_LOGS_PER_CARD,
  validateBackupData,
} from '../src/lib/validations/import'

describe('SEC-05: Backup import validation (validateBackupData)', () => {
  it('accepts valid v2 backup object with decks and settings', () => {
    const payload = {
      version: 2,
      settings: {
        minigamesEnabled: true,
        speechLanguage: 'en-GB',
      },
      decks: [
        {
          title: 'Spanisch Grundwortschatz',
          description: 'A1 Vokabeln',
          cards: [
            {
              front: 'hola',
              back: 'hallo',
              box: 1,
              easeFactor: 2.5,
              reviewLogs: [{ isCorrect: true, createdAt: '2026-10-20T10:00:00Z' }],
            },
          ],
        },
      ],
    }

    const res = validateBackupData(payload)
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.decks).toHaveLength(1)
      expect(res.data.decks[0].title).toBe('Spanisch Grundwortschatz')
      expect(res.data.decks[0].cards).toHaveLength(1)
      expect(res.data.decks[0].cards[0].reviewLogs).toHaveLength(1)
      expect(res.data.decks[0].cards[0].reviewLogs[0].createdAt).toBeInstanceOf(Date)
      expect(res.data.settings?.minigamesEnabled).toBe(true)
    }
  })

  it('accepts valid legacy array format (Deck[])', () => {
    const payload = [
      {
        title: 'Englisch Basics',
        cards: [
          { front: 'apple', back: 'Apfel' },
          { front: 'car', back: 'Auto' },
        ],
      },
    ]

    const res = validateBackupData(payload)
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.decks).toHaveLength(1)
      expect(res.data.decks[0].cards).toHaveLength(2)
      expect(res.data.settings).toBeNull()
    }
  })

  it('strips unknown fields to prevent prototype pollution or unexpected schema injection', () => {
    const payload = [
      {
        title: 'Deck With Extra',
        extraProperty: 'malicious-or-unknown',
        cards: [
          {
            front: 'front',
            back: 'back',
            unknownProp: 12345,
          },
        ],
      },
    ]

    const res = validateBackupData(payload)
    expect(res.success).toBe(true)
    if (res.success) {
      expect((res.data.decks[0] as any).extraProperty).toBeUndefined()
      expect((res.data.decks[0].cards[0] as any).unknownProp).toBeUndefined()
    }
  })

  it('rejects empty or whitespace-only deck titles', () => {
    const res = validateBackupData([{ title: '   ' }])
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toContain('Deck-Titel darf nicht leer sein')
    }
  })

  it('rejects oversized deck title (> 200 chars)', () => {
    const res = validateBackupData([{ title: 'A'.repeat(201) }])
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toContain('Deck-Titel darf maximal 200 Zeichen lang sein')
    }
  })

  it('rejects empty card front or back', () => {
    const res = validateBackupData([
      {
        title: 'Valid Title',
        cards: [{ front: '', back: 'Back' }],
      },
    ])
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toContain('Vorderseite darf nicht leer sein')
    }
  })

  it('rejects card front exceeding 2000 characters', () => {
    const res = validateBackupData([
      {
        title: 'Valid Title',
        cards: [{ front: 'x'.repeat(2001), back: 'Back' }],
      },
    ])
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toContain('Vorderseite darf maximal 2000 Zeichen lang sein')
    }
  })

  it('rejects easeFactor out of bounds (< 1.0 or > 5.0)', () => {
    const res = validateBackupData([
      {
        title: 'Valid Title',
        cards: [{ front: 'f', back: 'b', easeFactor: 0.5 }],
      },
    ])
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toContain('Ease-Factor')
    }
  })

  it('rejects negative box number', () => {
    const res = validateBackupData([
      {
        title: 'Valid Title',
        cards: [{ front: 'f', back: 'b', box: -1 }],
      },
    ])
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toContain('Box-Nummer')
    }
  })

  it('accepts cards with large box numbers from spaced repetition intervals (> 50)', () => {
    const res = validateBackupData([
      {
        title: 'SRS Deck',
        cards: [
          { front: 'f1', back: 'b1', box: 78 },
          { front: 'f2', back: 'b2', box: 218 },
          { front: 'f3', back: 'b3', box: 1000 },
        ],
      },
    ])
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.decks[0].cards[0].box).toBe(78)
      expect(res.data.decks[0].cards[1].box).toBe(218)
      expect(res.data.decks[0].cards[2].box).toBe(1000)
    }
  })

  it('rejects box number greater than 100000', () => {
    const res = validateBackupData([
      {
        title: 'Valid Title',
        cards: [{ front: 'f', back: 'b', box: 100001 }],
      },
    ])
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toContain('Box-Nummer')
    }
  })

  it('rejects import with more than 100 decks', () => {
    const decks = Array.from({ length: MAX_DECKS_PER_IMPORT + 1 }, (_, i) => ({
      title: `Deck ${i + 1}`,
    }))
    const res = validateBackupData(decks)
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toContain('Maximal 100 Decks')
    }
  })

  it('rejects deck with more than 2000 cards', () => {
    const cards = Array.from({ length: MAX_CARDS_PER_DECK + 1 }, (_, i) => ({
      front: `Front ${i}`,
      back: `Back ${i}`,
    }))
    const res = validateBackupData([{ title: 'Huge Deck', cards }])
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toContain('Maximal 2000 Karten')
    }
  })

  it('rejects card with more than 1000 review logs', () => {
    const logs = Array.from({ length: MAX_REVIEW_LOGS_PER_CARD + 1 }, () => ({
      isCorrect: true,
    }))
    const res = validateBackupData([
      {
        title: 'Deck with many logs',
        cards: [{ front: 'f', back: 'b', reviewLogs: logs }],
      },
    ])
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toContain('Maximal 1000 Review-Logs')
    }
  })

  it('rejects non-array and non-object inputs', () => {
    expect(validateBackupData('not-an-object').success).toBe(false)
    expect(validateBackupData(12345).success).toBe(false)
    expect(validateBackupData(null).success).toBe(false)
    expect(validateBackupData({ invalid: 'format' }).success).toBe(false)
  })

  it('verifies MAX_IMPORT_SIZE_BYTES is set to 5 MB', () => {
    expect(MAX_IMPORT_SIZE_BYTES).toBe(5 * 1024 * 1024)
  })
})
