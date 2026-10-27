import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth-guard"
import { getSetupState } from "@/actions/setup"
import { getDeckById } from "@/actions/decks"
import WorksheetClientView from "./WorksheetClientView"

export const dynamic = "force-dynamic"

export default async function WorksheetPage({ params }: { params: Promise<{ id: string }> }) {
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
  if (!deck) {
    return notFound()
  }

  return <WorksheetClientView deckId={id} />
}
