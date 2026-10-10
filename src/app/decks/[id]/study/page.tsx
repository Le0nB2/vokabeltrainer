import { getDeckById } from "@/actions/decks"
import { notFound } from "next/navigation"
import { StudySession } from "@/components/StudySession"
import { getSettings } from "@/actions/settings"

export const dynamic = 'force-dynamic'

export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const deck = await getDeckById(id)
  const settings = await getSettings()

  if (!deck) return notFound()

  const now = new Date()

  const dueCards = deck.cards.filter(c => c.dueDate <= now)
  // Shuffle cards
  for (let i = dueCards.length - 1; i > 0; i--) {
    // eslint-disable-next-line react-hooks/purity
    const j = Math.floor(Math.random() * (i + 1));
    [dueCards[i], dueCards[j]] = [dueCards[j], dueCards[i]];
  }


  return (
    <main className="min-h-screen bg-zinc-100 dark:bg-zinc-950 flex flex-col">
      <StudySession deck={deck} dueCards={dueCards} settings={settings} />
    </main>
  )
}
