import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { StudySession } from '../src/components/StudySession'
import { maskSpoiler } from '../src/lib/utils/string'

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

describe('QA-Prüfung: StudySession & string.ts', () => {
  const mockDeck = {
    id: 'deck-qa-1',
    cards: [
      {
        id: 'card-1',
        deckId: 'deck-qa-1',
        front: 'apple',
        back: 'der Apfel',
        box: 1,
        gapText: 'I eat an ___ every day.',
        lapses: 3,
        mnemonic: 'Apple klingt wie Appel, also Apfel.',
      },
      {
        id: 'card-2',
        deckId: 'deck-qa-1',
        front: 'banana',
        back: 'die Banane',
        box: 5,
        gapText: null,
        lapses: 0,
        mnemonic: 'Banane ist krumm.',
      },
    ],
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
    vi.useFakeTimers()
    vi.clearAllMocks()
    window.scrollTo = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // =========================================================================
  // 1. Flackern / Render-Stabilität beim Umdrehen
  // =========================================================================
  describe('1. Flackern / Render-Stabilität beim Umdrehen', () => {
    it('synchronously clears hint visibility when advancing cards without render ghosting', () => {
      const cards = [
        {
          id: 'c1',
          deckId: 'deck-qa-1',
          front: 'dog',
          back: 'Hund',
          box: 1,
          lapses: 3,
          mnemonic: 'Der Hund bellt laut.',
        },
        {
          id: 'c2',
          deckId: 'deck-qa-1',
          front: 'cat',
          back: 'Katze',
          box: 1,
          lapses: 0,
          mnemonic: 'Die Katze schnurrt.',
        },
      ]

      const { container } = render(<StudySession deck={mockDeck} dueCards={cards} settings={mockSettings} />)

      // Advance 5s so hint button shows on Card 1
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(screen.getByRole('button', { name: /tipp anzeigen/i })).toBeDefined()

      // Reveal hint
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /tipp anzeigen/i }))
      })
      expect(screen.getByTitle('Klicken zum Ausblenden')).toBeDefined()

      // Flip card
      act(() => {
        fireEvent.click(screen.getByText(/Klicken oder Leertaste zum Umdrehen/i))
      })
      expect(container.querySelector('.transform-style-3d.rotate-x-180')).not.toBeNull()

      // Rate card (advance to card 2)
      const gutBtn = screen.getByText(/Gut \(3\)/i)
      act(() => {
        fireEvent.click(gutBtn)
      })

      // Immediately after click, hint button and revealed hint must NOT linger
      expect(screen.queryByTitle('Klicken zum Ausblenden')).toBeNull()
      expect(screen.queryByRole('button', { name: /tipp anzeigen/i })).toBeNull()

      // Complete transition
      act(() => {
        vi.advanceTimersByTime(350)
      })

      // On card 2 (lapses: 0), at 5s, hint button must still NOT appear (only at 10s)
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(screen.queryByRole('button', { name: /tipp anzeigen/i })).toBeNull()
    })

    it('uses perspective-1000, transform-style-3d and backface-hidden for clean 3D rotation', () => {
      const { container } = render(<StudySession deck={mockDeck} dueCards={mockDeck.cards} settings={mockSettings} />)

      const perspectiveWrapper = container.querySelector('.perspective-1000')
      expect(perspectiveWrapper).not.toBeNull()

      const transformCard = perspectiveWrapper?.querySelector('.transform-style-3d')
      expect(transformCard).not.toBeNull()

      const faces = transformCard?.querySelectorAll('.backface-hidden')
      expect(faces?.length).toBe(2) // Front and Back both have backface-hidden
    })
  })

  // =========================================================================
  // 2. Timing der Tipps
  // =========================================================================
  describe('2. Timing der Tipps (5s bei Problemkarten, 10s bei normalen Karten)', () => {
    it('shows hint at exactly 5000ms for lapses >= 3', () => {
      const cards = [{
        id: 'c1',
        deckId: 'd1',
        front: 'tree',
        back: 'Baum',
        box: 1,
        lapses: 3,
        mnemonic: 'Am Baum wachsen Äste.',
      }]

      render(<StudySession deck={mockDeck} dueCards={cards} settings={mockSettings} />)

      act(() => { vi.advanceTimersByTime(4999) })
      expect(screen.queryByRole('button', { name: /tipp anzeigen/i })).toBeNull()

      act(() => { vi.advanceTimersByTime(1) })
      expect(screen.getByRole('button', { name: /tipp anzeigen/i })).toBeDefined()
    })

    it('shows hint at exactly 10000ms for lapses < 3 (e.g. lapses: 2)', () => {
      const cards = [{
        id: 'c2',
        deckId: 'd1',
        front: 'water',
        back: 'Wasser',
        box: 1,
        lapses: 2,
        mnemonic: 'Wasser fließt im Fluss.',
      }]

      render(<StudySession deck={mockDeck} dueCards={cards} settings={mockSettings} />)

      act(() => { vi.advanceTimersByTime(5000) })
      expect(screen.queryByRole('button', { name: /tipp anzeigen/i })).toBeNull()

      act(() => { vi.advanceTimersByTime(4999) })
      expect(screen.queryByRole('button', { name: /tipp anzeigen/i })).toBeNull()

      act(() => { vi.advanceTimersByTime(1) })
      expect(screen.getByRole('button', { name: /tipp anzeigen/i })).toBeDefined()
    })

    it('never shows hint if card has no mnemonic', () => {
      const cards = [{
        id: 'c3',
        deckId: 'd1',
        front: 'stone',
        back: 'Stein',
        box: 1,
        lapses: 5,
        mnemonic: null,
      }]

      render(<StudySession deck={mockDeck} dueCards={cards} settings={mockSettings} />)

      act(() => { vi.advanceTimersByTime(15000) })
      expect(screen.queryByRole('button', { name: /tipp anzeigen/i })).toBeNull()
    })
  })

  // =========================================================================
  // 3. Klick-Isolation & Flip-Vermeidung
  // =========================================================================
  describe('3. Klick-Isolation & Flip-Vermeidung', () => {
    it('clicking "Tipp anzeigen" or revealed hint does NOT flip card and retains input focus in typing mode', () => {
      const cards = [{
        id: 'c-typing',
        deckId: 'd1',
        front: 'library',
        back: 'Bibliothek',
        box: 5, // typing mode
        lapses: 3,
        mnemonic: 'In der Library liest man Bücher.',
      }]

      const { container } = render(<StudySession deck={mockDeck} dueCards={cards} settings={mockSettings} />)

      const input = screen.getByPlaceholderText('Antwort eintippen...') as HTMLInputElement
      expect(document.activeElement).toBe(input)

      // User types partial answer
      act(() => {
        fireEvent.change(input, { target: { value: 'biblio' } })
      })
      expect(input.value).toBe('biblio')

      // 5 seconds pass -> hint button appears
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      const tippBtn = screen.getByRole('button', { name: /tipp anzeigen/i })
      expect(tippBtn).toBeDefined()

      // User clicks hint button
      act(() => {
        fireEvent.click(tippBtn)
      })

      // 1. Card must NOT be flipped
      expect(container.querySelector('.transform-style-3d.rotate-x-180')).toBeNull()

      // 2. Input still has value "biblio"
      expect(input.value).toBe('biblio')

      // 3. Input is re-focused
      expect(document.activeElement).toBe(input)

      // 4. Revealed hint is visible
      const revealedHint = screen.getByTitle('Klicken zum Ausblenden')
      expect(revealedHint).toBeDefined()

      // User clicks revealed hint to toggle off
      act(() => {
        fireEvent.click(revealedHint)
      })

      // Card still not flipped, input still focused
      expect(container.querySelector('.transform-style-3d.rotate-x-180')).toBeNull()
      expect(document.activeElement).toBe(input)
      expect(input.value).toBe('biblio')
    })
  })

  // =========================================================================
  // 4. Spoiler-Schutz (maskSpoiler)
  // =========================================================================
  describe('4. Spoiler-Schutz (maskSpoiler)', () => {
    it('masks target answer in de-en, en-de and gapText directions', () => {
      // en-de: Target is German
      expect(maskSpoiler('Apple klingt wie Appel, also Apfel.', 'der Apfel')).toBe('Apple klingt wie Appel, also [...].')

      // de-en: Target is English
      expect(maskSpoiler('Art ist Kunst auf Englisch.', 'art')).toBe('[...] ist Kunst auf Englisch.')

      // Gap text: Target is English front
      expect(maskSpoiler('Eat your breakfast every morning.', 'breakfast')).toBe('Eat your [...] every morning.')
    })

    it('handles punctuation, special chars, uppercase/lowercase and umlauts properly', () => {
      // Case insensitivity
      expect(maskSpoiler('Das Auto ist schnell.', 'auto')).toBe('Das [...] ist schnell.')
      expect(maskSpoiler('das auto ist schnell.', 'AUTO')).toBe('das [...] ist schnell.')

      // Umlauts and ß
      expect(maskSpoiler('Auf der Straße fahren Autos.', 'die Straße')).toBe('Auf der [...] fahren Autos.')
      expect(maskSpoiler('Auf der Strasse fahren Autos.', 'die Straße')).toBe('Auf der [...] fahren Autos.') // ss vs ß
      expect(maskSpoiler('In der Küche kocht man.', 'die Küche')).toBe('In der [...] kocht man.')
      expect(maskSpoiler('Der Fluss ist tief.', 'der Fluß')).toBe('Der [...] ist tief.') // ß vs ss

      // Target with punctuation and alternatives
      expect(maskSpoiler('Ich gehe nach oben im Haus.', 'oben; nach oben (im Haus)')).toBe('Ich gehe [...] [...] im Haus.')

      // Punctuation adjacent to target word
      expect(maskSpoiler('Hier ist ein Bild!', 'Bild')).toBe('Hier ist ein [...]!')
      expect(maskSpoiler('(Kunst) ist schön.', 'Kunst')).toBe('([...]) ist schön.')

      // Substrings should NOT be masked
      expect(maskSpoiler('The carpet is red and categories exist.', 'car')).toBe('The carpet is red and categories exist.')
      expect(maskSpoiler('Der Automat funktioniert.', 'Auto')).toBe('Der Automat funktioniert.')

      // Multiple occurrences of target word
      expect(maskSpoiler('Kunst kommt von Können, Kunst ist toll.', 'Kunst')).toBe('[...] kommt von Können, [...] ist toll.')
    })

    it('handles edge cases safely (empty strings, null, undefined)', () => {
      expect(maskSpoiler('', 'test')).toBe('')
      expect(maskSpoiler('Mnemonic text', '')).toBe('Mnemonic text')
      expect(maskSpoiler('Mnemonic text', null)).toBe('Mnemonic text')
      expect(maskSpoiler('Mnemonic text', undefined)).toBe('Mnemonic text')
      expect(maskSpoiler(null as any, 'test')).toBe('')
    })
  })

  // =========================================================================
  // 5. Rückseite (Clean Surface)
  // =========================================================================
  describe('5. Rückseite (Clean Surface: Mnemonic NUR bei Problemkarten lapses >= 3)', () => {
    it('shows mnemonic on back only if lapses >= 3, keeping surface clean for lapses < 3', () => {
      const cards = [
        {
          id: 'card-problem',
          deckId: 'd1',
          front: 'mountain',
          back: 'Berg',
          box: 1,
          lapses: 3, // Problem card
          mnemonic: 'Auf dem Berg steht eine Hütte.',
        },
        {
          id: 'card-normal-2',
          deckId: 'd1',
          front: 'valley',
          back: 'Tal',
          box: 1,
          lapses: 2, // Normal card (border case < 3)
          mnemonic: 'Im Tal fließt Wasser.',
        },
        {
          id: 'card-normal-0',
          deckId: 'd1',
          front: 'forest',
          back: 'Wald',
          box: 1,
          lapses: 0, // Fresh card
          mnemonic: 'Im Wald gibt es Bäume.',
        },
      ]

      render(<StudySession deck={mockDeck} dueCards={cards} settings={mockSettings} />)

      // 1. Flip Problem Card (lapses = 3)
      act(() => {
        fireEvent.click(screen.getByText(/Klicken oder Leertaste zum Umdrehen/i))
      })
      expect(screen.getByText(/💡 Eselsbrücke:/i)).toBeDefined()
      expect(screen.getByText(/Auf dem Berg steht eine Hütte/i)).toBeDefined()

      // Advance to Card 2 (lapses = 2)
      act(() => {
        fireEvent.click(screen.getByText(/Gut \(3\)/i))
        vi.advanceTimersByTime(350)
      })

      // Flip Card 2 (lapses = 2)
      act(() => {
        fireEvent.click(screen.getByText(/Klicken oder Leertaste zum Umdrehen/i))
      })
      // Mnemonic must NOT appear on back
      expect(screen.queryByText(/💡 Eselsbrücke:/i)).toBeNull()
      expect(screen.queryByText(/Im Tal fließt Wasser/i)).toBeNull()

      // Advance to Card 3 (lapses = 0)
      act(() => {
        fireEvent.click(screen.getByText(/Gut \(3\)/i))
        vi.advanceTimersByTime(350)
      })

      // Flip Card 3 (lapses = 0)
      act(() => {
        fireEvent.click(screen.getByText(/Klicken oder Leertaste zum Umdrehen/i))
      })
      // Mnemonic must NOT appear on back
      expect(screen.queryByText(/💡 Eselsbrücke:/i)).toBeNull()
      expect(screen.queryByText(/Im Wald gibt es Bäume/i)).toBeNull()
    })
  })

  // =========================================================================
  // 6. Mögliche Regressionen
  // =========================================================================
  describe('6. Mögliche Regressionen', () => {
    it('handles keyboard navigation: Space/Enter to flip, 1-4 for ratings in classic mode', () => {
      const cards = [{
        id: 'c1',
        deckId: 'd1',
        front: 'sun',
        back: 'Sonne',
        box: 1,
        lapses: 0,
      }]

      const { container } = render(<StudySession deck={mockDeck} dueCards={cards} settings={mockSettings} />)
      act(() => {
        vi.advanceTimersByTime(10)
      })

      const studyContainer = container.querySelector('[tabIndex="0"]')!

      // Press Space to flip
      act(() => {
        fireEvent.keyDown(studyContainer, { key: ' ' })
      })
      expect(container.querySelector('.transform-style-3d.rotate-x-180')).not.toBeNull()

      // Press '3' to rate "Gut"
      act(() => {
        fireEvent.keyDown(studyContainer, { key: '3' })
      })
      act(() => {
        vi.advanceTimersByTime(350)
      })

      // Session completed!
      expect(screen.getByText(/Session beendet!/i)).toBeDefined()
    })

    it('supports "Session wiederholen" cleanly without state corruption', () => {
      const cards = [{
        id: 'c1',
        deckId: 'deck-qa-1',
        front: 'sun',
        back: 'Sonne',
        box: 1,
        lapses: 0,
      }]

      const singleDeck = {
        id: 'deck-qa-1',
        cards: cards,
      }

      render(<StudySession deck={singleDeck} dueCards={cards} settings={mockSettings} />)
      act(() => {
        vi.advanceTimersByTime(10)
      })

      // Finish session
      act(() => {
        fireEvent.click(screen.getByText(/Klicken oder Leertaste zum Umdrehen/i))
      })
      act(() => {
        fireEvent.click(screen.getByText(/Gut \(3\)/i))
      })
      act(() => {
        vi.advanceTimersByTime(350)
      })

      expect(screen.getByText(/Session beendet!/i)).toBeDefined()

      // Click "Session wiederholen"
      const repeatBtn = screen.getByRole('button', { name: /Session wiederholen/i })
      act(() => {
        fireEvent.click(repeatBtn)
        vi.advanceTimersByTime(10)
      })

      // Back on first card, not completed
      expect(screen.queryByText(/Session beendet!/i)).toBeNull()
      expect(screen.getByText('Karte 1 von 1')).toBeDefined()
    })
  })
})
