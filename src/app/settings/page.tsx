import Link from "next/link"
import { ArrowLeft, Settings as SettingsIcon } from "lucide-react"
import { ImportExport } from "@/components/ImportExport"
import { MinigameSettings } from "@/components/MinigameSettings"
import { NotificationSettings } from "@/components/NotificationSettings"
import { ApiUsageChart } from "@/components/ApiUsageChart"
import { getSettings } from "@/actions/settings"
import { getApiStats } from "@/actions/api-stats"

export const metadata = {
  title: 'Einstellungen | Vokabeltrainer',
}

export default async function SettingsPage() {
  const settings = await getSettings()
  const apiStats = await getApiStats()

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-8">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Zurück zur Übersicht
          </Link>
          <div className="flex items-center gap-3">
            <SettingsIcon className="w-8 h-8 text-blue-600 shrink-0" />
            <h1 className="text-2xl sm:text-3xl font-bold truncate">Einstellungen & Backup</h1>
          </div>
        </header>

        <ApiUsageChart data={apiStats} />
        <NotificationSettings initialSettings={settings} />
        <MinigameSettings initialSettings={settings} />
        <ImportExport />
      </div>
    </main>
  )
}
