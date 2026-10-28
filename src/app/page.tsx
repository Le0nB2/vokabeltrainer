import { getDecks, createDeck } from "@/actions/decks"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, BookOpen, Settings, Brain } from "lucide-react"
import { AppLogo } from "@/components/AppLogo"
import { DeckMenu } from "@/components/DeckMenu"
import { DeckPieChart } from "@/components/DeckPieChart"
import { LearningStatsChart } from "@/components/LearningStatsChart"
import { LogoutButton } from "@/components/LogoutButton"
import { getAppAuthCredentials, AUTH_COOKIE_NAME } from "@/lib/auth-utils"
import { getCurrentUser } from "@/lib/auth-guard"
import { getSetupState } from "@/actions/setup"
import prisma from "@/lib/prisma"
import { subDays, format } from "date-fns"
import { cookies } from "next/headers"

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const setupState = await getSetupState()
  if (setupState.needsSetup) {
    redirect("/setup")
  }

  const user = await getCurrentUser()
  if (!user) {
    const cookieStore = await cookies()
    const hasStaleCookie = Boolean(cookieStore.get(AUTH_COOKIE_NAME)?.value)
    if (hasStaleCookie) {
      redirect("/login?clear=1")
    }
    redirect("/login")
  }

  const isSetupMode = user.id === "default"
  const decks = await getDecks()
  const now = new Date()

  const { isConfigured: isAuthEnabled } = getAppAuthCredentials()
  const totalDueCount = decks.reduce((acc, deck) => acc + deck.cards.filter(c => c.dueDate <= now).length, 0)


  // Fetch 7-day stats
  const sevenDaysAgo = subDays(now, 6)
  sevenDaysAgo.setHours(0,0,0,0)

  const deckFilter =
    !user || user.id === "default"
      ? undefined
      : user.role === "ADMIN"
      ? { OR: [{ userId: user.id }, { userId: null }] }
      : { userId: user.id }

  const logs = await prisma.reviewLog.findMany({
    where: {
      createdAt: {
        gte: sevenDaysAgo
      },
      ...(deckFilter && { deck: deckFilter })
    },
    select: {
      createdAt: true,
      isCorrect: true
    }
  })

  // Process logs into daily stats
  const statsMap = new Map()
  for (let i = 0; i < 7; i++) {
    const d = subDays(now, 6 - i)
    statsMap.set(format(d, 'dd.MM.'), { correct: 0, incorrect: 0 })
  }

  logs.forEach(log => {
    const day = format(log.createdAt, 'dd.MM.')
    if (statsMap.has(day)) {
      const entry = statsMap.get(day)
      if (log.isCorrect) {
        entry.correct++
      } else {
        entry.incorrect++
      }
    }
  })

  const stats = Array.from(statsMap.entries()).map(([date, data]) => ({
    date,
    correct: data.correct,
    incorrect: data.incorrect
  }))

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-12">
          <div className="flex justify-between items-center w-full sm:w-auto">
            <AppLogo asHeading size="lg" />
            <div className="flex items-center gap-1 sm:hidden">
              <Link href="/settings" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors p-2" title="Einstellungen">
                <Settings className="w-6 h-6" />
              </Link>
              {!isSetupMode && <LogoutButton />}
            </div>
          </div>
          {totalDueCount > 0 && (
            <div className="w-full sm:w-auto mb-4 sm:mb-0">
              <Link
                href="/study"
                className="flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Brain className="w-5 h-5" />
                Alle fälligen Vokabeln üben
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-sm">
                  {totalDueCount}
                </span>
              </Link>
            </div>
          )}
          <div className="flex gap-2 sm:gap-3 items-center w-full sm:w-auto">
            <form action={async (formData) => {
              "use server"
              const title = (formData.get("title") as string)?.trim()
              if (title) {
                try {
                  await createDeck(title)
                } catch (err) {
                  console.error("Fehler beim Erstellen des Decks:", err)
                }
              }
            }} className="flex gap-2 w-full sm:w-auto">
              <input
                name="title"
                placeholder="Neues Deck Name..."
                required
                className="flex-1 sm:w-auto border rounded-lg px-3 py-2 text-sm dark:bg-zinc-900 dark:border-zinc-800 min-w-0"
              />
              <button type="submit" className="shrink-0 flex items-center gap-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
                <Plus className="w-4 h-4" /> Anlegen
              </button>
            </form>
            <div className="hidden sm:flex items-center gap-1 sm:gap-2">
              {!isSetupMode && (
                <span className="text-xs bg-zinc-200 dark:bg-zinc-800 px-2.5 py-1 rounded-full text-zinc-700 dark:text-zinc-300 font-medium">
                  {user.username}
                </span>
              )}
              <Link href="/settings" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors p-2" title="Einstellungen">
                <Settings className="w-5 h-5" />
              </Link>
              {!isSetupMode && (
                <LogoutButton className="inline-flex items-center text-zinc-500 hover:text-red-600 dark:hover:text-red-400 transition-colors p-2 rounded-lg" />
              )}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {decks.map(deck => {
            const dueCount = deck.cards.filter(c => c.dueDate <= now).length

            // Calculate Box distribution (clamp box >= 7 to Stufe 7)
            const boxes = [0, 0, 0, 0, 0, 0, 0] // 7 boxes
            deck.cards.forEach(c => {
              const boxNum = Number(c.box) || 1
              const boxIndex = Math.min(6, Math.max(0, Math.floor(boxNum) - 1))
              boxes[boxIndex]++
            })

            return (
              <div key={deck.id} className="bg-white dark:bg-zinc-900 rounded-xl p-6 shadow-sm border border-zinc-200 dark:border-zinc-800 hover:border-blue-500 dark:hover:border-blue-500 transition-colors group relative">
                <DeckMenu deckId={deck.id} cardCount={deck.cards.length} />

                {/* If there are no cards, go to the detail page to add some. Otherwise, go to study. */}
                <Link href={deck.cards.length === 0 ? `/decks/${deck.id}` : `/decks/${deck.id}/study`} className="block">
                  <h2 className="text-xl font-semibold mb-2">{deck.title}</h2>
                  <div className="flex gap-4 text-sm text-zinc-500 mb-6">
                    <span>{deck._count.cards} Karten</span>
                    {dueCount > 0 && <span className="text-amber-600 font-medium">{dueCount} heute fällig</span>}
                  </div>

                  {/* Progress / Box Distribution */}
                  <div className="mt-4">
                    <DeckPieChart boxes={boxes} totalCards={deck.cards.length} />
                  </div>
                </Link>
              </div>
            )
          })}

          {decks.length === 0 && (
            <div className="col-span-full text-center py-24 text-zinc-500 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
              <BookOpen className="w-12 h-12 mx-auto mb-4 text-zinc-300" />
              <p>Du hast noch keine Decks angelegt.</p>
              <p className="text-sm mt-1">Nutze das Formular oben rechts, um dein erstes Deck zu erstellen.</p>
            </div>
          )}
        </div>

        <LearningStatsChart stats={stats} />
      </div>
    </main>
  )
}
