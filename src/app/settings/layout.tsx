import { cookies } from "next/headers"
import { verifySessionCookie } from "@/lib/auth-utils"
import { PasswordPrompt } from "@/components/PasswordPrompt"

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const envPassword = process.env.SETTINGS_PASSWORD
  const cookieStore = await cookies()
  const isAuthenticated = verifySessionCookie(
    cookieStore.get("settings_auth")?.value,
    envPassword
  )

  if (envPassword && !isAuthenticated) {
    return <PasswordPrompt />
  }

  return <>{children}</>
}
