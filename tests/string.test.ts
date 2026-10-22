import { describe, it, expect } from 'vitest'
import { damerauLevenshtein, evaluateAnswer, extractAnswerVariants } from '../src/lib/utils/string'

describe('damerauLevenshtein', () => {
  it('should return 0 for identical strings', () => {
    expect(damerauLevenshtein('test', 'test')).toBe(0)
    expect(damerauLevenshtein('  test  ', 'test')).toBe(0) // test trim
    expect(damerauLevenshtein('Test', 'test')).toBe(0) // test toLowerCase
  })

  it('should return the correct distance for transpositions', () => {
    expect(damerauLevenshtein('teh', 'the')).toBe(1)
  })

  it('should return the correct distance for substitutions', () => {
    expect(damerauLevenshtein('test', 'text')).toBe(1)
  })
})

describe('extractAnswerVariants', () => {
  it('should extract variants separated by semicolons and strip parenthesized context', () => {
    const variants = extractAnswerVariants('oben; nach oben (im Haus)')
    expect(variants).toContain('oben')
    expect(variants).toContain('nach oben')
  })

  it('should extract variants separated by slashes and commas', () => {
    const variants = extractAnswerVariants('Dies ist ... / Das ist ...')
    expect(variants).toContain('dies ist')
    expect(variants).toContain('das ist')

    const commaVariants = extractAnswerVariants('daheim, zu Hause')
    expect(commaVariants).toContain('daheim')
    expect(commaVariants).toContain('zu hause')
  })

  it('should generate variants with and without leading articles', () => {
    const variants = extractAnswerVariants('das Auto')
    expect(variants).toContain('das auto')
    expect(variants).toContain('auto')

    const verbVariants = extractAnswerVariants('to come')
    expect(verbVariants).toContain('to come')
    expect(verbVariants).toContain('come')
  })
})

describe('evaluateAnswer', () => {
  it('should return CORRECT for identical inputs', () => {
    const result = evaluateAnswer('hello', 'hello')
    expect(result.status).toBe('CORRECT')
  })

  it('should return TYPO for words with a minor typo', () => {
    // Length is 5, max allowed is 1
    const result = evaluateAnswer('hllo', 'hello')
    expect(result.status).toBe('TYPO')
  })

  it('should return WRONG for words with a major typo', () => {
    const result = evaluateAnswer('haalo', 'hello')
    expect(result.status).toBe('WRONG')
  })

  it('should ignore punctuation in evaluation', () => {
    const result = evaluateAnswer('hello!', 'hello')
    expect(result.status).toBe('CORRECT')
  })

  it('should ignore text in brackets', () => {
    const result = evaluateAnswer('like', '(to) like')
    expect(result.status).toBe('CORRECT')
    const result2 = evaluateAnswer('hello', 'hello [sth]')
    expect(result2.status).toBe('CORRECT')
  })

  it('should ignore question marks and quotes', () => {
    const result = evaluateAnswer('How are you', 'How are you?')
    expect(result.status).toBe('CORRECT')
    const result2 = evaluateAnswer('its', "it's")
    expect(result2.status).toBe('CORRECT')
  })

  describe('Deck S.231-232 child-friendly matching', () => {
    it('accepts single synonym variants for upstairs', () => {
      expect(evaluateAnswer('oben', 'oben; nach oben (im Haus)').status).toBe('CORRECT')
      expect(evaluateAnswer('nach oben', 'oben; nach oben (im Haus)').status).toBe('CORRECT')
      expect(evaluateAnswer('nach obn', 'oben; nach oben (im Haus)').status).toBe('TYPO')
      expect(evaluateAnswer('unten', 'oben; nach oben (im Haus)').status).toBe('WRONG')
    })

    it('accepts single synonym variants for at home, everyone, dad, mum, room', () => {
      expect(evaluateAnswer('daheim', 'daheim, zu Hause').status).toBe('CORRECT')
      expect(evaluateAnswer('zu Hause', 'daheim, zu Hause').status).toBe('CORRECT')
      expect(evaluateAnswer('jeder', 'jeder; alle').status).toBe('CORRECT')
      expect(evaluateAnswer('alle', 'jeder; alle').status).toBe('CORRECT')
      expect(evaluateAnswer('Papa', 'der Papa, der Vati').status).toBe('CORRECT')
      expect(evaluateAnswer('Vati', 'der Papa, der Vati').status).toBe('CORRECT')
      expect(evaluateAnswer('Mama', 'die Mama, die Mutti').status).toBe('CORRECT')
      expect(evaluateAnswer('Zimmer', 'das Zimmer, der Raum').status).toBe('CORRECT')
      expect(evaluateAnswer('Raum', 'das Zimmer, der Raum').status).toBe('CORRECT')
    })

    it('handles German articles flexibly (with or without der/die/das)', () => {
      expect(evaluateAnswer('Auto', 'das Auto').status).toBe('CORRECT')
      expect(evaluateAnswer('das Auto', 'das Auto').status).toBe('CORRECT')
      expect(evaluateAnswer('Straße', 'die Straße').status).toBe('CORRECT')
      expect(evaluateAnswer('die Straße', 'die Straße').status).toBe('CORRECT')
      expect(evaluateAnswer('Strasse', 'die Straße').status).toBe('CORRECT') // ss / ß equivalence
    })

    it('handles English verbs and articles flexibly (to come, an hour)', () => {
      expect(evaluateAnswer('come', 'to come').status).toBe('CORRECT')
      expect(evaluateAnswer('to come', 'to come').status).toBe('CORRECT')
      expect(evaluateAnswer('hour', 'an hour').status).toBe('CORRECT')
      expect(evaluateAnswer('an hour', 'an hour').status).toBe('CORRECT')
    })

    it('handles English contractions and expanded forms', () => {
      expect(evaluateAnswer('she is', "she's").status).toBe('CORRECT')
      expect(evaluateAnswer("she's", "she's").status).toBe('CORRECT')
      expect(evaluateAnswer('you are', "you're").status).toBe('CORRECT')
      expect(evaluateAnswer("you're", "you're").status).toBe('CORRECT')
      expect(evaluateAnswer('they are not', "they aren't").status).toBe('CORRECT')
      expect(evaluateAnswer("they aren't", "they aren't").status).toBe('CORRECT')
      expect(evaluateAnswer('they are', "they're").status).toBe('CORRECT')
      expect(evaluateAnswer('It is not here', "It isn't here").status).toBe('CORRECT')
    })

    it('handles parenthesized telephone and road context', () => {
      expect(evaluateAnswer('Handy', 'das (Mobil-)Telefon, das Handy').status).toBe('CORRECT')
      expect(evaluateAnswer('Telefon', 'das (Mobil-)Telefon, das Handy').status).toBe('CORRECT')
      expect(evaluateAnswer('Mobiltelefon', 'das (Mobil-)Telefon, das Handy').status).toBe('CORRECT')
      expect(evaluateAnswer('Straße', 'die Straße (Landstraße zwischen Orten; Straße in Orten)').status).toBe('CORRECT')
    })

    it('handles greetings and short answers', () => {
      expect(evaluateAnswer('Bis bald', 'Bis gleich. / Bis bald.').status).toBe('CORRECT')
      expect(evaluateAnswer('Entschuldigung', 'Verzeihung. / Entschuldigung.').status).toBe('CORRECT')
      expect(evaluateAnswer('Yes, I am', 'Yes, I am.').status).toBe('CORRECT')
      expect(evaluateAnswer('Yes I am', 'Yes, I am.').status).toBe('CORRECT')
    })
  })
})
