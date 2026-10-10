import { cookies } from "next/headers"
import { PasswordPrompt } from "@/components/PasswordPrompt"

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const envPassword = process.env.SETTINGS_PASSWORD
  const cookieStore = await cookies()
  const isAuthenticated = cookieStore.get("settings_auth")?.value === "true"

  if (envPassword && !isAuthenticated) {
    return <PasswordPrompt />
  }

  return <>{children}</>
}
