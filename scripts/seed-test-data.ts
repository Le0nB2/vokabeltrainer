import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding test data for migration safety check...')

  const deck = await prisma.deck.create({
    data: {
      title: 'Migration Test Deck',
      description: 'Used to verify data integrity across migrations',
      lastResultCorrect: 10,
      lastResultIncorrect: 2,
    },
  })

  const card1 = await prisma.card.create({
    data: {
      deckId: deck.id,
      front: 'Test Front 1',
      back: 'Test Back 1',
      box: 3,
      consecutiveCorrect: 2,
    },
  })

  await prisma.card.create({
    data: {
      deckId: deck.id,
      front: 'Test Front 2',
      back: 'Test Back 2',
      gapText: 'This is a [gap] text.',
      notes: 'Some test notes',
    },
  })

  await prisma.reviewLog.create({
    data: {
      deckId: deck.id,
      cardId: card1.id,
    },
  })

  console.log(`Test data seeded successfully. Deck ID: ${deck.id}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
