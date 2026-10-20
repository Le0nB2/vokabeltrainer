import { cookies } from "next/headers"
import { verifySettingsSessionToken, SETTINGS_COOKIE_NAME } from "@/lib/auth-utils"
import { PasswordPrompt } from "@/components/PasswordPrompt"

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const envPassword = process.env.SETTINGS_PASSWORD
  const cookieStore = await cookies()
  const isAuthenticated = verifySettingsSessionToken(
    cookieStore.get(SETTINGS_COOKIE_NAME)?.value,
    envPassword
  )

  if (envPassword && !isAuthenticated) {
    return <PasswordPrompt />
  }

  return <>{children}</>
}
