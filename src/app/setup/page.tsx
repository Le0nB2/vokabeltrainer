import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { getSetupState } from "@/actions/setup"
import { SetupWizard } from "@/components/SetupWizard"

export const dynamic = 'force-dynamic'

export const metadata = {
  title: "Ersteinrichtung | Vokabeltrainer",
  description: "Ersteinrichtung des Vokabeltrainers",
}

export default async function SetupPage() {
  const setupState = await getSetupState()
  const headersList = await headers()
  const isServerAction = Boolean(headersList.get("next-action"))

  if (!setupState.needsSetup && !isServerAction) {
    redirect("/")
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4 sm:p-8">
      <SetupWizard isPublicOrRender={setupState.isPublicOrRender} />
    </main>
  )
}
