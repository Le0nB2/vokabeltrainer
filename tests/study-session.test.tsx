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

  it('automatically sets cursor in text field on initial render for typing cards', async () => {
    const dueCards = [
      {
        id: 'card-1',
        deckId: 'deck-1',
        front: 'apple',
        back: 'Apfel',
        box: 5, // typing mode
        gapText: null,
        lapses: 0,
      },
    ]

    render(<StudySession deck={mockDeck} dueCards={dueCards} settings={mockSettings} />)

    const input = screen.getByPlaceholderText('Antwort eintippen...') as HTMLInputElement
    expect(input).toBeDefined()
    expect(input.getAttribute('enterkeyhint') || (input as any).enterKeyHint).toBe('send')
    expect(input.getAttribute('inputmode')).toBe('text')
    expect(input.getAttribute('autocapitalize')).toBe('off')
    expect(input.getAttribute('autocorrect')).toBe('off')

    // Expect input to be focused
    expect(document.activeElement).toBe(input)
  })

  it('automatically focuses input when advancing to the next typing card via "Weiter"', async () => {
    const dueCards = [
      {
        id: 'card-1',
        deckId: 'deck-1',
        front: 'apple',
        back: 'Apfel',
        box: 5,
        gapText: null,
        lapses: 0,
      },
      {
        id: 'card-2',
        deckId: 'deck-1',
        front: 'banana',
        back: 'Banane',
        box: 4,
        gapText: null,
        lapses: 0,
      },
    ]

    render(<StudySession deck={mockDeck} dueCards={dueCards} settings={mockSettings} />)

    const input1 = screen.getByPlaceholderText('Antwort eintippen...') as HTMLInputElement
    expect(document.activeElement).toBe(input1)

    // Type and submit Card 1
    act(() => {
      fireEvent.change(input1, { target: { value: 'apple' } })
    })
    const submitBtn = screen.getByTitle('Absenden')
    act(() => {
      fireEvent.click(submitBtn)
    })

    // Advance to Card 2 via Weiter
    const weiterBtn = screen.getByRole('button', { name: /weiter/i })
    act(() => {
      fireEvent.click(weiterBtn)
    })

    // Wait for frame/settle
    await act(async () => {
      await new Promise(r => setTimeout(r, 60))
    })

    // On Card 2, input must be focused immediately
    const input2 = screen.getByPlaceholderText('Antwort eintippen...') as HTMLInputElement
    expect(document.activeElement).toBe(input2)
  })

  it('automatically focuses input when transitioning from a classic card to a typing card', async () => {
    const dueCards = [
      {
        id: 'card-1',
        deckId: 'deck-1',
        front: 'dog',
        back: 'Hund',
        box: 2, // classic flip mode
        gapText: null,
        lapses: 0,
      },
      {
        id: 'card-2',
        deckId: 'deck-1',
        front: 'cat',
        back: 'Katze',
        box: 5, // typing mode
        gapText: null,
        lapses: 0,
      },
    ]

    render(<StudySession deck={mockDeck} dueCards={dueCards} settings={mockSettings} />)

    // Card 1 is classic flip card, so no input field
    expect(screen.queryByPlaceholderText('Antwort eintippen...')).toBeNull()

    // Flip Card 1 by clicking the card
    const cardElement = screen.getByText('Hund').closest('.cursor-pointer') || screen.getByText('dog').closest('.cursor-pointer')!
    act(() => {
      fireEvent.click(cardElement)
    })

    // Rate card as "Gut" (button 3)
    const gutBtn = screen.getByText(/Gut \(3\)/i).closest('button')!
    act(() => {
      fireEvent.click(gutBtn)
    })

    // Wait for frame/settle
    await act(async () => {
      await new Promise(r => setTimeout(r, 60))
    })

    // Card 2 is typing mode: input must be present and focused!
    const input2 = screen.getByPlaceholderText('Antwort eintippen...') as HTMLInputElement
    expect(input2).toBeDefined()
    expect(document.activeElement).toBe(input2)
  })

  it('re-focuses input when tapping the card front in typing mode', async () => {
    const dueCards = [
      {
        id: 'card-1',
        deckId: 'deck-1',
        front: 'orange',
        back: 'Orange',
        box: 5,
        gapText: null,
        lapses: 0,
      },
    ]

    render(<StudySession deck={mockDeck} dueCards={dueCards} settings={mockSettings} />)

    const input = screen.getByPlaceholderText('Antwort eintippen...') as HTMLInputElement
    expect(document.activeElement).toBe(input)

    // Simulate blurring input (user tapped outside or dismissed keyboard)
    act(() => {
      input.blur()
    })
    expect(document.activeElement).not.toBe(input)

    // Tap on the card
    const cardElement = input.closest('.cursor-pointer')!
    act(() => {
      fireEvent.click(cardElement)
    })

    // Input should be re-focused
    expect(document.activeElement).toBe(input)
  })

  it('re-focuses input after clicking pronunciation audio button in typing mode', async () => {
    const dueCards = [
      {
        id: 'card-1',
        deckId: 'deck-1',
        front: 'orange',
        back: 'Orange',
        box: 5,
        gapText: null,
        lapses: 0,
      },
    ]

    render(<StudySession deck={mockDeck} dueCards={dueCards} settings={mockSettings} />)

    const input = screen.getByPlaceholderText('Antwort eintippen...') as HTMLInputElement
    expect(document.activeElement).toBe(input)

    act(() => {
      input.blur()
    })
    expect(document.activeElement).not.toBe(input)

    const audioBtn = screen.getAllByTitle('Aussprache anhören')[0]
    act(() => {
      fireEvent.click(audioBtn)
    })

    expect(document.activeElement).toBe(input)
  })

  it('re-focuses input when clicking the outer study container in typing mode', async () => {
    const dueCards = [
      {
        id: 'card-1',
        deckId: 'deck-1',
        front: 'lemon',
        back: 'Zitrone',
        box: 5,
        gapText: null,
        lapses: 0,
      },
    ]

    render(<StudySession deck={mockDeck} dueCards={dueCards} settings={mockSettings} />)

    const input = screen.getByPlaceholderText('Antwort eintippen...') as HTMLInputElement
    expect(document.activeElement).toBe(input)

    act(() => {
      input.blur()
    })
    expect(document.activeElement).not.toBe(input)

    // Click outside the card on the outer container
    const outerContainer = input.closest('.flex-1.flex.flex-col')!
    act(() => {
      fireEvent.click(outerContainer)
    })

    expect(document.activeElement).toBe(input)
  })

  it('has visible caret color and transparent placeholder on focus for clean cursor placement', async () => {
    const dueCards = [
      {
        id: 'card-1',
        deckId: 'deck-1',
        front: 'lemon',
        back: 'Zitrone',
        box: 5,
        gapText: null,
        lapses: 0,
      },
    ]

    render(<StudySession deck={mockDeck} dueCards={dueCards} settings={mockSettings} />)

    const input = screen.getByPlaceholderText('Antwort eintippen...') as HTMLInputElement
    expect(input.className).toContain('caret-blue-600')
    expect(input.className).toContain('focus:placeholder-transparent')
  })
})
