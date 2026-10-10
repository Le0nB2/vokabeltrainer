import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// 80 simple English words with German translation
const VOCABULARY = [
  { front: 'time', back: 'Zeit' }, { front: 'year', back: 'Jahr' }, { front: 'people', back: 'Leute/Menschen' },
  { front: 'way', back: 'Weg/Art' }, { front: 'day', back: 'Tag' }, { front: 'man', back: 'Mann' },
  { front: 'thing', back: 'Ding/Sache' }, { front: 'woman', back: 'Frau' }, { front: 'life', back: 'Leben' },
  { front: 'child', back: 'Kind' }, { front: 'world', back: 'Welt' }, { front: 'school', back: 'Schule' },
  { front: 'state', back: 'Staat/Zustand' }, { front: 'family', back: 'Familie' }, { front: 'student', back: 'Student/Schüler' },
  { front: 'group', back: 'Gruppe' }, { front: 'country', back: 'Land' }, { front: 'problem', back: 'Problem' },
  { front: 'hand', back: 'Hand' }, { front: 'part', back: 'Teil' }, { front: 'place', back: 'Ort/Platz' },
  { front: 'case', back: 'Fall' }, { front: 'week', back: 'Woche' }, { front: 'company', back: 'Firma/Unternehmen' },
  { front: 'system', back: 'System' }, { front: 'program', back: 'Programm' }, { front: 'question', back: 'Frage' },
  { front: 'work', back: 'Arbeit' }, { front: 'government', back: 'Regierung' }, { front: 'number', back: 'Nummer/Zahl' },
  { front: 'night', back: 'Nacht' }, { front: 'point', back: 'Punkt' }, { front: 'home', back: 'Zuhause' },
  { front: 'water', back: 'Wasser' }, { front: 'room', back: 'Zimmer/Raum' }, { front: 'mother', back: 'Mutter' },
  { front: 'area', back: 'Bereich/Gebiet' }, { front: 'money', back: 'Geld' }, { front: 'story', back: 'Geschichte' },
  { front: 'fact', back: 'Tatsache/Fakt' }, { front: 'month', back: 'Monat' }, { front: 'lot', back: 'Menge' },
  { front: 'right', back: 'Recht/richtig' }, { front: 'study', back: 'Studie/Lernen' }, { front: 'book', back: 'Buch' },
  { front: 'eye', back: 'Auge' }, { front: 'job', back: 'Beruf/Job' }, { front: 'word', back: 'Wort' },
  { front: 'business', back: 'Geschäft' }, { front: 'issue', back: 'Ausgabe/Problem' }, { front: 'side', back: 'Seite' },
  { front: 'kind', back: 'Art/Sorte' }, { front: 'head', back: 'Kopf' }, { front: 'house', back: 'Haus' },
  { front: 'service', back: 'Dienst' }, { front: 'friend', back: 'Freund' }, { front: 'father', back: 'Vater' },
  { front: 'power', back: 'Macht/Kraft' }, { front: 'hour', back: 'Stunde' }, { front: 'game', back: 'Spiel' },
  { front: 'line', back: 'Linie/Zeile' }, { front: 'end', back: 'Ende' }, { front: 'member', back: 'Mitglied' },
  { front: 'law', back: 'Gesetz' }, { front: 'car', back: 'Auto' }, { front: 'city', back: 'Stadt' },
  { front: 'community', back: 'Gemeinschaft' }, { front: 'name', back: 'Name' }, { front: 'president', back: 'Präsident' },
  { front: 'team', back: 'Mannschaft/Team' }, { front: 'minute', back: 'Minute' }, { front: 'idea', back: 'Idee' },
  { front: 'kid', back: 'Kind' }, { front: 'body', back: 'Körper' }, { front: 'information', back: 'Information' },
  { front: 'back', back: 'Rücken/zurück' }, { front: 'parent', back: 'Elternteil' }, { front: 'face', back: 'Gesicht' },
  { front: 'others', back: 'Andere' }, { front: 'level', back: 'Ebene/Niveau' }
]

async function main() {
  console.log('=== Setting up 80 cards for manual testing ===')

  // Create a specific test deck
  const deck = await prisma.deck.create({
    data: {
      title: 'Test Deck - 80 Words',
      description: 'Deck used for testing SRS logic and Minigame intervals (80 cards)'
    }
  })
  console.log(`Created deck: ${deck.title} (ID: ${deck.id})`)

  // Create the 80 cards
  const cardsData = VOCABULARY.map(vocab => ({
    deckId: deck.id,
    front: vocab.front,
    back: vocab.back,
    // explicitly setting initial values as per schema defaults just to be safe
    box: 1,
    easeFactor: 2.5,
    lapses: 0,
    consecutiveCorrect: 0,
    dueDate: new Date(),
  }))

  const created = await prisma.card.createMany({
    data: cardsData
  })

  console.log(`Successfully added ${created.count} cards to the deck.`)
  console.log(`You can now start a Study Session in the UI with this deck to test minigames and the SRS UI.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
