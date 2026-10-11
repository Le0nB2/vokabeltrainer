import { describe, it, expect } from 'vitest'
import { damerauLevenshtein, evaluateAnswer } from '../src/lib/utils/string'

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
})
  it('should ignore question marks and quotes', () => {
    const result = evaluateAnswer('How are you', 'How are you?')
    expect(result.status).toBe('CORRECT')
    const result2 = evaluateAnswer('its', "it's")
    expect(result2.status).toBe('CORRECT')
  })
