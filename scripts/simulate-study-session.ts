import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// 10 mock words for the simulation
const MOCK_VOCABULARY = [
  { front: 'time', back: 'Zeit' }, { front: 'year', back: 'Jahr' }, { front: 'people', back: 'Leute/Menschen' },
  { front: 'way', back: 'Weg/Art' }, { front: 'day', back: 'Tag' }, { front: 'man', back: 'Mann' },
  { front: 'thing', back: 'Ding/Sache' }, { front: 'woman', back: 'Frau' }, { front: 'life', back: 'Leben' },
  { front: 'child', back: 'Kind' }
]

async function main() {
  console.log('=== Starting SRS Study Session Simulation ===')

  // 1. Setup a temporary test deck
  const deck = await prisma.deck.create({
    data: {
      title: 'Simulation Deck - SRS Test',
      description: 'Temporary deck to simulate updateCardProgress logic'
    }
  })

  await prisma.card.createMany({
    data: MOCK_VOCABULARY.map(vocab => ({
      deckId: deck.id,
      front: vocab.front,
      back: vocab.back,
      box: 1, // represents interval in days in the new SRS logic
      easeFactor: 2.5,
      dueDate: new Date(),
    }))
  })

  let cards = await prisma.card.findMany({ where: { deckId: deck.id } })
  console.log(`Created ${cards.length} cards.`)

  function simulateRating(card: { box: number; easeFactor: number; lapses: number; consecutiveCorrect: number; }, rating: string) {
    let newBox = card.box;
    let newEaseFactor = card.easeFactor;
    let newLapses = card.lapses;
    let newConsecutive = card.consecutiveCorrect;

    if (rating === 'again') {
      newBox = 1;
      newLapses += 1;
      newEaseFactor = Math.max(1.3, newEaseFactor - 0.20);
      newConsecutive = 0;
    } else if (rating === 'hard') {
      newBox = Math.max(1, Math.round(newBox * 1.2));
      newEaseFactor = Math.max(1.3, newEaseFactor - 0.15);
      newConsecutive += 1;
    } else if (rating === 'good') {
      newBox = Math.max(1, Math.round(newBox === 0 ? 1 : newBox * newEaseFactor));
      newConsecutive += 1;
    } else if (rating === 'easy') {
      newBox = Math.max(1, Math.round(newBox === 0 ? 4 : newBox * newEaseFactor * 1.3));
      newEaseFactor += 0.15;
      newConsecutive += 1;
    }
    return { newBox, newEaseFactor, newLapses, newConsecutive };
  }

  // 2. Simulate user reviews
  console.log('\n--- Simulating Reviews ---')
  for (const card of cards) {
    // Pick a random rating
    const ratings: ('again' | 'hard' | 'good' | 'easy')[] = ['again', 'hard', 'good', 'easy'];
    const randomRating = ratings[Math.floor(Math.random() * ratings.length)];

    const expected = simulateRating(card, randomRating);

    // Call the exact same logic we have in backend, but directly on prisma to not depend on Next.js server actions in the script
    const now = new Date();
    const dueDate = new Date(now.getTime() + Math.round(expected.newBox) * 24 * 60 * 60 * 1000);

    await prisma.card.update({
      where: { id: card.id },
      data: {
        box: expected.newBox,
        easeFactor: expected.newEaseFactor,
        lapses: expected.newLapses,
        consecutiveCorrect: expected.newConsecutive,
        lastReviewed: now,
        dueDate: dueDate
      }
    });

    console.log(`Card "${card.front}" rated "${randomRating}".`)
    console.log(`  -> Interval(box): ${expected.newBox} days, Ease: ${expected.newEaseFactor.toFixed(2)}, Due: +${expected.newBox} days`);
  }

  // 3. Verify
  console.log('\n--- Verifying Database Changes ---')
  cards = await prisma.card.findMany({ where: { deckId: deck.id } })
  let allValid = true;
  for (const card of cards) {
    if (card.box === 0 || card.easeFactor < 1.3) {
      allValid = false;
      console.error(`ERROR: Card ${card.front} has invalid state: box=${card.box}, ease=${card.easeFactor}`);
    }
  }

  if (allValid) {
    console.log('SUCCESS: All cards have valid SRS states after review.')
  } else {
    console.log('FAILED: Some cards have invalid SRS states.')
  }

  // 4. Cleanup
  console.log('\nCleaning up simulation deck...')
  await prisma.deck.delete({ where: { id: deck.id } })
  console.log('Cleanup complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
