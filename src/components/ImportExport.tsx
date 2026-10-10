"use client"

import { useState } from "react"
import { Upload, Download, Loader2 } from "lucide-react"
import { importData } from "@/actions/settings"
import { useRouter } from "next/navigation"

export function ImportExport() {
  const [isImporting, setIsImporting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const router = useRouter()

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    setMessage(null)

    try {
      const text = await file.text()
      const result = await importData(text)

      if (result.success) {
        setMessage({ type: 'success', text: 'Import erfolgreich abgeschlossen!' })
        // Clear file input
        e.target.value = ''
        router.refresh()
      } else {
        setMessage({ type: 'error', text: result.error || 'Import fehlgeschlagen.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Fehler beim Lesen der Datei.' })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="space-y-6 mt-6">
      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-2">Daten Exportieren</h3>
        <p className="text-sm text-zinc-500 mb-4">Lade alle deine Decks, Karten, Lernstände und Einstellungen als JSON-Datei herunter.</p>
        <a
          href="/api/export"
          download="vokabeltrainer_export.json"
          className="inline-flex items-center gap-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Download className="w-4 h-4" /> Exportieren (JSON)
        </a>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-2">Daten Importieren</h3>
        <p className="text-sm text-zinc-500 mb-4 text-red-600 font-medium">Achtung: Dies fügt die importierten Decks zu deinen bestehenden Daten hinzu. Es überschreibt jedoch deine aktuellen globalen Einstellungen (sofern in der Datei vorhanden).</p>

        <div className="relative inline-block">
            <input
                type="file"
                accept=".json"
                onChange={handleImport}
                disabled={isImporting}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                id="file-upload"
            />
            <label
                htmlFor="file-upload"
                className={`inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-opacity ${isImporting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700 cursor-pointer'}`}
            >
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isImporting ? 'Importiere...' : 'Importieren (JSON)'}
            </label>
        </div>
      </div>
    </div>
  )
}
