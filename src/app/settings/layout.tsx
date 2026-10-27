import { checkSettingsAuthenticated } from "@/actions/auth"
import { PasswordPrompt } from "@/components/PasswordPrompt"

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const isAuthenticated = await checkSettingsAuthenticated()

  if (!isAuthenticated) {
    return <PasswordPrompt />
  }

  return <>{children}</>
}
