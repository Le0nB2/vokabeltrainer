import { Settings as SettingsIcon } from "lucide-react"
import { SettingsBackButton } from "@/components/SettingsBackButton"
import { ImportExport } from "@/components/ImportExport"
import { MinigameSettings } from "@/components/MinigameSettings"
import { NotificationSettings } from "@/components/NotificationSettings"
import { AudioSettings } from "@/components/AudioSettings"
import { AiModelSettings } from "@/components/AiModelSettings"
import { UserManagementSettings } from "@/components/UserManagementSettings"
import { getSettings, getAvailableAiModelsAction } from "@/actions/settings"
import { getUserManagementData } from "@/actions/users"
import { getApiStats } from "@/actions/api-stats"
import { LockSettingsButton } from "@/components/LockSettingsButton"

export const metadata = {
  title: 'Einstellungen | Vokabeltrainer',
}

export default async function SettingsPage() {
  const settings = await getSettings()
  const apiStats = await getApiStats()
  const availableModels = await getAvailableAiModelsAction()
  const userManagementData = await getUserManagementData()
  const isSettingsProtected = Boolean(process.env.SETTINGS_PASSWORD)

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 px-4 pt-8 pb-12 sm:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6 sm:mb-8">
          <SettingsBackButton />
          {isSettingsProtected && <LockSettingsButton />}
        </div>

        <header className="mb-8 flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-blue-600 shrink-0" />
          <h1 className="text-2xl sm:text-3xl font-bold">Einstellungen & Backup</h1>
        </header>

        <AudioSettings initialSettings={settings} />
        <MinigameSettings initialSettings={settings} />
        <NotificationSettings initialSettings={settings} />
        <AiModelSettings
          initialSettings={settings}
          initialModels={availableModels}
          apiStats={apiStats}
        />
        <UserManagementSettings initialData={userManagementData} />
        <ImportExport />
      </div>
    </main>
  )
}
