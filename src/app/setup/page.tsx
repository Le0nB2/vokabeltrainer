import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { getSetupState } from "@/actions/setup"
import { SetupWizard } from "@/components/SetupWizard"

export const dynamic = 'force-dynamic'

export const metadata = {
  title: "Ersteinrichtung",
  description: "Ersteinrichtung des N30 Vokabeltrainers",
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const setupState = await getSetupState()
  const params = await searchParams
  const hasAiConnected = Boolean(params.ai_connected || params.ai_error)
  const headersList = await headers()
  const isServerAction = Boolean(headersList.get("next-action"))

  if (!setupState.needsSetup && !isServerAction && !hasAiConnected) {
    redirect("/")
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4 sm:p-8">
      <SetupWizard
        isPublicOrRender={setupState.isPublicOrRender}
        isRender={setupState.isRender}
        initialDatabaseNeedsSetup={setupState.databaseNeedsSetup}
      />
    </main>
  )
}
