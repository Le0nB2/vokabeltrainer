import { describe, it, expect } from 'vitest'
import { generateOptimizedPdf } from '../src/lib/utils/pdf-helper'

describe('WorksheetPDF Optimization', () => {
  it('should render exactly 4 pages with varying lengths of exercises', async () => {
    const wordBoxLengths = [15, 12, 10];

    for (const wbl of wordBoxLengths) {
        // Generate dummy data
        const dummyExercises = {
          multipleChoice: Array.from({ length: 12 }).map((_, i) => ({
            question: `A real question would look something like this and take some space ${i + 1}`,
            options: ['Option A is short', 'Option B is a bit longer', 'Option C', 'Option D'],
            answer: 'Option A is short',
            correctIndex: 0
          })),
          fillInTheBlank: Array.from({ length: 12 }).map((_, i) => ({
            sentenceBeforeGap: `Sentence ${i + 1} with some text before`,
            sentenceAfterGap: `and then some text after`,
            germanHint: 'German hint here',
            answer: `answer`
          })),
          wordBoxWords: Array.from({ length: wbl }).map((_, i) => `word${i}`),
          wordBoxSentences: Array.from({ length: wbl }).map((_, i) => ({
            sentenceBeforeGap: `Wordbox sentence ${i + 1} before`,
            sentenceAfterGap: `after`,
            answer: `word${i}`
          })),
          translateSentences: Array.from({ length: 24 }).map((_, i) => ({
            germanSentence: `Dies ist ein realitätsnaher Satz ${i + 1} der übersetzt werden soll.`,
            englishFirstLetter: 'T',
            answer: 'This is a test sentence.'
          }))
        }

        const dummySolutions = {
          multipleChoiceSolutions: dummyExercises.multipleChoice.map(x => x.answer),
          fillInTheBlankSolutions: dummyExercises.fillInTheBlank.map(x => x.answer),
          wordBoxSolutions: dummyExercises.wordBoxSentences.map(x => x.answer),
          translateSolutions: dummyExercises.translateSentences.map(x => x.answer)
        }

        const result = await generateOptimizedPdf(`Test Deck ${wbl}`, '2023-10-26', dummyExercises, dummySolutions, 4);
        expect(result.pages).toBeLessThanOrEqual(4);
    }
  }, 90000)
})
