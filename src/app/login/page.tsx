import { Suspense } from "react"
import { redirect } from "next/navigation"
import { LoginForm } from "@/components/LoginForm"
import { getSetupState } from "@/actions/setup"
import { getCurrentUser } from "@/lib/auth-guard"
import { getAppAuthCredentials } from "@/lib/auth-utils"
import prisma from "@/lib/prisma"

export const dynamic = 'force-dynamic'

export const metadata = {
  title: "Anmelden | Vokabeltrainer",
  description: "Anmeldung zum Vokabeltrainer",
}

export default async function LoginPage() {
  const setupState = await getSetupState()
  if (setupState.needsSetup) {
    redirect("/setup")
  }

  const { isConfigured } = getAppAuthCredentials()
  const dbUserCount = await prisma.user.count().catch(() => 0)
  if (!isConfigured && dbUserCount === 0) {
    redirect("/")
  }

  const user = await getCurrentUser()
  if (user && user.id !== "default") {
    redirect("/")
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center text-zinc-500">
            Laden...
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  )
}
