import { describe, it, expect } from 'vitest'

function calculateBoxDistribution(cards: { box: number }[]): number[] {
  const boxes = [0, 0, 0, 0, 0, 0, 0] // 7 boxes
  cards.forEach(c => {
    const boxNum = Number(c.box) || 1
    const boxIndex = Math.min(6, Math.max(0, Math.floor(boxNum) - 1))
    boxes[boxIndex]++
  })
  return boxes
}

describe('Deck box distribution calculation', () => {
  it('maps initial cards to Stufe 1', () => {
    const cards = Array.from({ length: 40 }, () => ({ box: 1 }))
    const boxes = calculateBoxDistribution(cards)
    expect(boxes).toEqual([40, 0, 0, 0, 0, 0, 0])
    expect(boxes.reduce((a, b) => a + b, 0)).toBe(40)
  })

  it('clamps cards with box >= 7 (SRS intervals) into Stufe 7', () => {
    const cards = [
      { box: 7 },
      { box: 8 },
      { box: 10 },
      { box: 20 },
      { box: 50 },
    ]
    const boxes = calculateBoxDistribution(cards)
    expect(boxes).toEqual([0, 0, 0, 0, 0, 0, 5])
    expect(boxes.reduce((a, b) => a + b, 0)).toBe(5)
  })

  it('handles mixed boxes correctly without losing cards', () => {
    const cards = [
      { box: 1 },
      { box: 2 },
      { box: 3 },
      { box: 4 },
      { box: 5 },
      { box: 6 },
      { box: 7 },
      { box: 15 },
      { box: 30 },
    ]
    const boxes = calculateBoxDistribution(cards)
    expect(boxes).toEqual([1, 1, 1, 1, 1, 1, 3])
    expect(boxes.reduce((a, b) => a + b, 0)).toBe(9)
  })

  it('handles invalid or non-positive boxes safely', () => {
    const cards = [
      { box: 0 },
      { box: -1 },
      { box: NaN },
      { box: 1 },
    ]
    const boxes = calculateBoxDistribution(cards)
    // Non-positive or NaN defaults to box 1 (index 0)
    expect(boxes).toEqual([4, 0, 0, 0, 0, 0, 0])
  })
})
