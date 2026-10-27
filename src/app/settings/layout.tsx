import { checkSettingsAuthenticated } from "@/actions/auth"
import { PasswordPrompt } from "@/components/PasswordPrompt"
import { getCurrentUser } from "@/lib/auth-guard"
import { getSetupState } from "@/actions/setup"
import { redirect } from "next/navigation"

export const dynamic = 'force-dynamic'

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const setupState = await getSetupState()
  if (setupState.needsSetup) {
    redirect("/setup")
  }

  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  const isAuthenticated = await checkSettingsAuthenticated()

  if (!isAuthenticated) {
    return <PasswordPrompt />
  }

  return <>{children}</>
}
