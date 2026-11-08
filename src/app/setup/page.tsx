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
  const isPreview = Boolean(params.preview)
  const rawStep = typeof params.step === "string" ? params.step : undefined
  const headersList = await headers()
  const isServerAction = Boolean(headersList.get("next-action"))

  if (!setupState.needsSetup && !isServerAction && !hasAiConnected && !isPreview) {
    redirect("/")
  }

  const initialStep =
    rawStep === "welcome"
      ? ("welcome" as const)
      : rawStep === "0"
      ? (0 as const)
      : rawStep === "1"
      ? (1 as const)
      : rawStep === "2"
      ? (2 as const)
      : rawStep === "3"
      ? (3 as const)
      : rawStep === "4"
      ? (4 as const)
      : undefined

  const isRender = Boolean(setupState.isRender || params.render === "1" || params.render === "true")
  const initialShowAdvanced = Boolean(params.advanced === "1" || params.advanced === "true")

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4 sm:p-8">
      <SetupWizard
        isPublicOrRender={setupState.isPublicOrRender || isRender}
        isRender={isRender}
        initialDatabaseNeedsSetup={setupState.databaseNeedsSetup}
        initialStep={initialStep}
        initialShowAdvanced={initialShowAdvanced}
      />
    </main>
  )
}
