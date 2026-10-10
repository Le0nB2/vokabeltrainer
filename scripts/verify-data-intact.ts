import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Verifying test data after migration...')

  const deck = await prisma.deck.findFirst({
    where: { title: 'Migration Test Deck' },
    include: {
      cards: true,
      reviewLogs: true,
    },
  })

  if (!deck) {
    throw new Error('Data Loss Detected: Test deck is missing!')
  }

  if (deck.cards.length !== 2) {
    throw new Error(`Data Loss/Corruption Detected: Expected 2 cards, found ${deck.cards.length}`)
  }

  if (deck.reviewLogs.length !== 1) {
    throw new Error(`Data Loss/Corruption Detected: Expected 1 review log, found ${deck.reviewLogs.length}`)
  }

  const card1 = deck.cards.find(c => c.front === 'Test Front 1')
  if (!card1 || card1.box !== 3 || card1.consecutiveCorrect !== 2) {
      throw new Error('Data Loss/Corruption Detected: Card 1 data is corrupted or missing.')
  }

  const card2 = deck.cards.find(c => c.front === 'Test Front 2')
  if (!card2 || card2.gapText !== 'This is a [gap] text.' || card2.notes !== 'Some test notes') {
      throw new Error('Data Loss/Corruption Detected: Card 2 data is corrupted or missing.')
  }

  if (deck.lastResultCorrect !== 10 || deck.lastResultIncorrect !== 2) {
      throw new Error('Data Loss/Corruption Detected: Deck result data is corrupted.')
  }

  console.log('Verification passed: Test data is completely intact.')

  // Cleanup test data
  await prisma.deck.delete({
      where: { id: deck.id }
  })
  console.log('Test data cleaned up.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
