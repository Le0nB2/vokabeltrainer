import { getDeckById } from "@/actions/decks"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Play } from "lucide-react"
import { DeckToolbar } from "@/components/DeckToolbar"
import { getCurrentUser } from "@/lib/auth-guard"
import { getSetupState } from "@/actions/setup"

export const dynamic = 'force-dynamic'

export default async function DeckDetails({ params }: { params: Promise<{ id: string }> }) {
  const setupState = await getSetupState()
  if (setupState.needsSetup) {
    redirect("/setup")
  }

  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  const { id } = await params
  const deck = await getDeckById(id)

  if (!deck) return notFound()

  const now = new Date()
  const dueCards = deck.cards.filter(c => c.dueDate <= now)

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="max-w-5xl mx-auto p-8">
        <Link href="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Zurück zum Dashboard
        </Link>

        <header className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-bold mb-2">{deck.title}</h1>
            <p className="text-zinc-500">
              {deck.cards.length} Karten insgesamt · <span className="text-amber-600 font-medium">{dueCards.length} fällig zum Lernen</span>
            </p>
          </div>

          <div className="flex items-center gap-4">
            {deck.cards.length >= 5 && (
              <Link
                href={`/decks/${deck.id}/worksheet`}
                target="_blank"
                className="inline-flex items-center gap-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-6 py-3 rounded-xl font-medium hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors shadow-sm"
              >
                📄 Arbeitsblatt drucken
              </Link>
            )}
            {dueCards.length > 0 ? (
              <Link
                href={`/decks/${deck.id}/study`}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Play className="w-5 h-5 fill-current" /> Jetzt lernen
              </Link>
            ) : (
              <button disabled className="inline-flex items-center gap-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-400 px-6 py-3 rounded-xl font-medium cursor-not-allowed">
                <Play className="w-5 h-5" /> Alles gelernt!
              </button>
            )}
          </div>
        </header>

        {/* Client Component for Modals and Filters */}
        <DeckToolbar deck={deck} />

      </div>
    </main>
  )
}
