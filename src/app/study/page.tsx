import { getAllDueCards } from "@/actions/cards"
import { getSettings } from "@/actions/settings"
import { StudySession } from "@/components/StudySession"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth-guard"
import { getSetupState } from "@/actions/setup"

export const dynamic = 'force-dynamic'

export default async function GlobalStudyPage() {
  const setupState = await getSetupState()
  if (setupState.needsSetup) {
    redirect("/setup")
  }

  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  const settings = await getSettings()
  const dueCards = await getAllDueCards()

  if (dueCards.length === 0) {
    redirect('/')
  }

  // Shuffle cards globally (Fisher-Yates)
  for (let i = dueCards.length - 1; i > 0; i--) {
    const j = Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / 4294967295 * (i + 1));
    [dueCards[i], dueCards[j]] = [dueCards[j], dueCards[i]];
  }

  // Create a pseudo deck object for the StudySession
  const globalDeck = {
    id: 'global',
    cards: dueCards,
  }

  return (
    <main className="min-h-screen bg-zinc-100 dark:bg-zinc-950 flex flex-col">
      <StudySession deck={globalDeck} dueCards={dueCards} settings={settings} />
    </main>
  )
}
