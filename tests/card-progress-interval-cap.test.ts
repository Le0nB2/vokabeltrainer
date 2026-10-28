import { describe, it, expect, vi, beforeEach } from 'vitest'
import prisma from '@/lib/prisma'
import { updateCardProgress } from '@/actions/cards'
import { MAX_SRS_INTERVAL_DAYS } from '@/lib/constants'

vi.mock('@/lib/prisma', () => {
  return {
    default: {
      card: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      deck: {
        findUnique: vi.fn(),
      },
      reviewLog: {
        create: vi.fn().mockResolvedValue({ id: 'log-1' }),
      },
    },
  }
})

vi.mock('@/lib/auth-guard', () => ({
  requireAppAuth: vi.fn().mockResolvedValue(undefined),
  getCurrentUser: vi.fn().mockResolvedValue({ id: 'user-1', username: 'testuser', role: 'USER' }),
  UnauthorizedError: class UnauthorizedError extends Error {},
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('SRS Interval Capping at 365 days', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.deck.findUnique).mockResolvedValue({
      id: 'deck-1',
      userId: 'user-1',
    } as any)
  })

  it('exports MAX_SRS_INTERVAL_DAYS as 365', () => {
    expect(MAX_SRS_INTERVAL_DAYS).toBe(365)
  })

  it('caps card interval at 365 days when calculation would exceed 365 (rating: good)', async () => {
    // Card with box = 218 and easeFactor = 2.8
    // Normal calculation: 218 * 2.8 = 610 days!
    vi.mocked(prisma.card.findUnique).mockResolvedValue({
      id: 'card-1',
      deckId: 'deck-1',
      box: 218,
      easeFactor: 2.8,
      lapses: 0,
      consecutiveCorrect: 5,
    } as any)

    vi.mocked(prisma.card.update).mockImplementation((async ({ data }: any) => {
      return { id: 'card-1', ...data }
    }) as any)

    const before = Date.now()
    const result = await updateCardProgress('card-1', 'deck-1', 'good')
    const after = Date.now()

    // Verify box is strictly capped at 365
    expect(result.box).toBe(365)
    expect(result.consecutiveCorrect).toBe(6)

    // Verify dueDate is approximately now + 365 days (tolerance 5 seconds)
    const dueTime = result.dueDate.getTime()
    const expectedMinDue = before + 365 * 24 * 60 * 60 * 1000
    const expectedMaxDue = after + 365 * 24 * 60 * 60 * 1000 + 5000
    expect(dueTime).toBeGreaterThanOrEqual(expectedMinDue)
    expect(dueTime).toBeLessThanOrEqual(expectedMaxDue)
  })

  it('caps card interval at 365 days when rating is easy', async () => {
    // Card with box = 150, easeFactor = 2.5
    // Normal calculation: 150 * 2.5 * 1.3 = 487 days!
    vi.mocked(prisma.card.findUnique).mockResolvedValue({
      id: 'card-2',
      deckId: 'deck-1',
      box: 150,
      easeFactor: 2.5,
      lapses: 0,
      consecutiveCorrect: 4,
    } as any)

    vi.mocked(prisma.card.update).mockImplementation((async ({ data }: any) => {
      return { id: 'card-2', ...data }
    }) as any)

    const result = await updateCardProgress('card-2', 'deck-1', 'easy')

    expect(result.box).toBe(365)
  })

  it('does not cap interval when it is below 365 days', async () => {
    // Card with box = 10, easeFactor = 2.5
    // Normal calculation: 10 * 2.5 = 25 days
    vi.mocked(prisma.card.findUnique).mockResolvedValue({
      id: 'card-3',
      deckId: 'deck-1',
      box: 10,
      easeFactor: 2.5,
      lapses: 0,
      consecutiveCorrect: 2,
    } as any)

    vi.mocked(prisma.card.update).mockImplementation((async ({ data }: any) => {
      return { id: 'card-3', ...data }
    }) as any)

    const result = await updateCardProgress('card-3', 'deck-1', 'good')

    expect(result.box).toBe(25)
  })

  it('resets to 1 when rating is again, regardless of prior interval', async () => {
    vi.mocked(prisma.card.findUnique).mockResolvedValue({
      id: 'card-4',
      deckId: 'deck-1',
      box: 365,
      easeFactor: 2.5,
      lapses: 0,
      consecutiveCorrect: 10,
    } as any)

    vi.mocked(prisma.card.update).mockImplementation((async ({ data }: any) => {
      return { id: 'card-4', ...data }
    }) as any)

    const result = await updateCardProgress('card-4', 'deck-1', 'again')

    expect(result.box).toBe(1)
    expect(result.consecutiveCorrect).toBe(0)
    expect(result.lapses).toBe(1)
  })
})
