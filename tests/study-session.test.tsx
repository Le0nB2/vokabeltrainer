import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { StudySession } from '../src/components/StudySession'

vi.mock('@/actions/cards', () => ({
  updateCardProgress: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/actions/decks', () => ({
  saveDeckResult: vi.fn().mockResolvedValue({}),
}))

// Mock window.speechSynthesis
if (typeof window !== 'undefined') {
  window.speechSynthesis = {
    cancel: vi.fn(),
    speak: vi.fn(),
  } as any
}

describe('StudySession card flip & typing transition', () => {
  const mockDeck = {
    id: 'deck-1',
    cards: [],
  }

  const mockSettings = {
    minigamesEnabled: false,
    minigameIntervalMin: 5,
    minigameIntervalMax: 10,
    speedMatchEnabled: false,
    balloonPopEnabled: false,
    reactionTesterEnabled: false,
    wordDropEnabled: false,
    speechLanguage: 'en-GB',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps "Weiter" visible and does not show rating buttons during flip transition', async () => {
    const dueCards = [
      {
        id: 'card-1',
        deckId: 'deck-1',
        front: 'apple',
        back: 'Apfel',
        box: 5, // typing mode active
        gapText: 'She eats an ___ every day.',
        lapses: 0,
      },
      {
        id: 'card-2',
        deckId: 'deck-1',
        front: 'sun',
        back: 'Sonne',
        box: 1, // classic mode
        lapses: 0,
      },
    ]

    render(<StudySession deck={mockDeck} dueCards={dueCards} settings={mockSettings} />)

    // Verify input field is present
    const input = screen.getByPlaceholderText('Antwort eintippen...')
    expect(input).toBeDefined()

    // Submit an answer
    act(() => {
      fireEvent.change(input, { target: { value: 'apple' } })
    })
    const submitBtn = screen.getByTitle('Absenden')
    act(() => {
      fireEvent.click(submitBtn)
    })

    // The card flips to back: "Weiter" button appears
    const weiterBtn = screen.getByRole('button', { name: /weiter/i })
    expect(weiterBtn).toBeDefined()

    // Rating buttons must NOT be present
    expect(screen.queryByText(/Erneut \(1\)/i)).toBeNull()
    expect(screen.queryByText(/Schwer \(2\)/i)).toBeNull()
    expect(screen.queryByText(/Gut \(3\)/i)).toBeNull()
    expect(screen.queryByText(/Einfach \(4\)/i)).toBeNull()

    // Click "Weiter" to transition to next card
    act(() => {
      fireEvent.click(weiterBtn)
    })

    // Immediately after click, during the flip transition:
    // The rating buttons must STILL NOT be visible!
    expect(screen.queryByText(/Erneut \(1\)/i)).toBeNull()
    expect(screen.queryByText(/Schwer \(2\)/i)).toBeNull()
    expect(screen.queryByText(/Gut \(3\)/i)).toBeNull()
    expect(screen.queryByText(/Einfach \(4\)/i)).toBeNull()

    // The "Weiter" button remains rendered in the DOM while fading out
    expect(screen.getByRole('button', { name: /weiter/i })).toBeDefined()
  })
})
