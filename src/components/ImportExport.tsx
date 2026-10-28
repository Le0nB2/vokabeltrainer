"use client"

import { useState } from "react"
import { Upload, Download, Loader2, Users, UserPlus } from "lucide-react"
import { importData, UserImportMapping } from "@/actions/settings"
import { useRouter } from "next/navigation"

interface ImportExportProps {
  availableUsers?: Array<{
    id: string
    username: string
    displayName?: string | null
    role: string
  }>
}

interface MissingOwnerInfo {
  ownerUsername: string
  ownerDisplayName?: string | null
  deckCount: number
}

export function ImportExport({ availableUsers = [] }: ImportExportProps) {
  const [isImporting, setIsImporting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // Modal State for Mapping Unknown Profiles (Weg B)
  const [showMappingModal, setShowMappingModal] = useState(false)
  const [pendingText, setPendingText] = useState("")
  const [missingOwners, setMissingOwners] = useState<MissingOwnerInfo[]>([])
  const [mappings, setMappings] = useState<Record<string, UserImportMapping>>({})

  const router = useRouter()

  const handleExport = async () => {
    setIsExporting(true)
    setMessage(null)

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
      })

      if (!res.ok) {
        if (res.status === 401) {
          setMessage({ type: 'error', text: 'Nicht autorisiert. Bitte melde dich an.' })
        } else {
          setMessage({ type: 'error', text: 'Export fehlgeschlagen.' })
        }
        return
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vokabeltrainer_export_${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      setMessage({ type: 'success', text: 'Export erfolgreich heruntergeladen!' })
    } catch {
      setMessage({ type: 'error', text: 'Netzwerkfehler beim Exportieren der Daten.' })
    } finally {
      setIsExporting(false)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Die Datei ist zu groß (maximal 5 MB erlaubt).' })
      e.target.value = ''
      return
    }

    setIsImporting(true)
    setMessage(null)

    try {
      const text = await file.text()
      let parsed: any
      try {
        parsed = JSON.parse(text)
      } catch {
        setMessage({ type: 'error', text: 'Ungültiges JSON-Format. Die Datei konnte nicht analysiert werden.' })
        setIsImporting(false)
        e.target.value = ''
        return
      }

      // Extract decks from array or object format
      const decks = Array.isArray(parsed) ? parsed : parsed?.decks
      if (!Array.isArray(decks)) {
        setMessage({ type: 'error', text: 'Keine Vokabelstapel in der Datei gefunden.' })
        setIsImporting(false)
        e.target.value = ''
        return
      }

      // Check for distinct ownerUsernames
      const ownerCounts = new Map<string, { username: string; displayName?: string | null; count: number }>()
      for (const d of decks) {
        if (d?.ownerUsername && typeof d.ownerUsername === "string") {
          const lower = d.ownerUsername.trim().toLowerCase()
          const existing = ownerCounts.get(lower)
          if (existing) {
            existing.count++
          } else {
            ownerCounts.set(lower, {
              username: d.ownerUsername.trim(),
              displayName: d.ownerDisplayName || null,
              count: 1,
            })
          }
        }
      }

      // Find owners that do NOT exist in availableUsers
      const existingUsernames = new Set((availableUsers || []).map((u) => u.username.toLowerCase()))
      const missingList: MissingOwnerInfo[] = []

      ownerCounts.forEach((val, lower) => {
        if (!existingUsernames.has(lower)) {
          missingList.push({
            ownerUsername: val.username,
            ownerDisplayName: val.displayName,
            deckCount: val.count,
          })
        }
      })

      // If there are unknown profiles in the backup, open Mapping Dialog (Weg B)
      if (missingList.length > 0) {
        const initialMappings: Record<string, UserImportMapping> = {}
        missingList.forEach((m) => {
          initialMappings[m.ownerUsername.toLowerCase()] = {
            action: "create",
            displayName: m.ownerDisplayName || m.ownerUsername,
            password: "",
            targetUserId: availableUsers?.[0]?.id || "",
          }
        })

        setMissingOwners(missingList)
        setMappings(initialMappings)
        setPendingText(text)
        setShowMappingModal(true)
        setIsImporting(false)
        e.target.value = ''
        return
      }

      // No missing owners: directly import!
      const result = await importData(text)

      if (result.success) {
        setMessage({ type: 'success', text: 'Import erfolgreich abgeschlossen!' })
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

  const handleConfirmMappingImport = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate inputs for all "create" actions
    for (const m of missingOwners) {
      const lower = m.ownerUsername.toLowerCase()
      const mapping = mappings[lower]
      if (mapping?.action === "create") {
        if (!mapping.password || mapping.password.length < 8 || !/[^a-zA-Z0-9]/.test(mapping.password)) {
          alert(`Bitte gib für das neue Profil "${m.ownerUsername}" ein Passwort mit mindestens 8 Zeichen und 1 Sonderzeichen ein.`)
          return
        }
      } else if (mapping?.action === "assign" && !mapping.targetUserId) {
        alert(`Bitte wähle für "${m.ownerUsername}" ein existierendes Profil aus.`)
        return
      }
    }

    setIsImporting(true)
    setShowMappingModal(false)

    try {
      const result = await importData(pendingText, mappings)
      if (result.success) {
        setMessage({ type: 'success', text: 'Import mit Profil-Zuordnung erfolgreich abgeschlossen!' })
        router.refresh()
      } else {
        setMessage({ type: 'error', text: result.error || 'Import fehlgeschlagen.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Netzwerkfehler beim Importieren der Daten.' })
    } finally {
      setIsImporting(false)
      setPendingText("")
      setMissingOwners([])
    }
  }

  return (
    <>
      <div className="space-y-6 mt-8">
        {message && (
          <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-2">Daten Exportieren</h3>
          <p className="text-sm text-zinc-500 mb-4">Lade alle deine Decks, Karten, Lernstände und Profile als JSON-Datei herunter.</p>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="inline-flex items-center gap-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isExporting ? 'Exportiere...' : 'Exportieren (JSON)'}
          </button>
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

      {/* Profile Mapping Dialog (Weg B) */}
      {showMappingModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
                  Profile in der Sicherung zuordnen
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  In der Sicherung wurden Vokabelstapel gefunden, deren Profile noch nicht im System existieren.
                </p>
              </div>
            </div>

            <form onSubmit={handleConfirmMappingImport} className="space-y-4">
              {missingOwners.map((owner) => {
                const lower = owner.ownerUsername.toLowerCase()
                const currentMapping = mappings[lower] || { action: "create" }

                return (
                  <div
                    key={lower}
                    className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                        Profil &quot;{owner.ownerUsername}&quot;
                        {owner.ownerDisplayName && owner.ownerDisplayName !== owner.ownerUsername && (
                          <span className="font-normal text-zinc-400 text-xs ml-1">({owner.ownerDisplayName})</span>
                        )}
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium">
                        {owner.deckCount} {owner.deckCount === 1 ? "Stapel" : "Stapel"}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-800 dark:text-zinc-200">
                        <input
                          type="radio"
                          name={`mapping-action-${lower}`}
                          value="create"
                          checked={currentMapping.action === "create"}
                          onChange={() =>
                            setMappings((prev) => ({
                              ...prev,
                              [lower]: { ...prev[lower], action: "create" },
                            }))
                          }
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span>Als neues Kinder-Profil anlegen (Empfohlen)</span>
                      </label>

                      {currentMapping.action === "create" && (
                        <div className="pl-6 space-y-2 pt-1">
                          <div>
                            <label className="block text-[11px] font-medium text-zinc-500 mb-0.5">
                              Passwort für das Kind * (mind. 8 Zeichen & 1 Sonderzeichen)
                            </label>
                            <input
                              type="password"
                              required
                              minLength={8}
                              placeholder="Mind. 8 Z. & 1 S.-Z."
                              value={currentMapping.password || ""}
                              onChange={(e) =>
                                setMappings((prev) => ({
                                  ...prev,
                                  [lower]: { ...prev[lower], password: e.target.value },
                                }))
                              }
                              className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-zinc-500 mb-0.5">
                              Rufname (optional)
                            </label>
                            <input
                              type="text"
                              placeholder={owner.ownerUsername}
                              value={currentMapping.displayName || ""}
                              onChange={(e) =>
                                setMappings((prev) => ({
                                  ...prev,
                                  [lower]: { ...prev[lower], displayName: e.target.value },
                                }))
                              }
                              className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      )}

                      {availableUsers.length > 0 && (
                        <>
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-800 dark:text-zinc-200 pt-1">
                            <input
                              type="radio"
                              name={`mapping-action-${lower}`}
                              value="assign"
                              checked={currentMapping.action === "assign"}
                              onChange={() =>
                                setMappings((prev) => ({
                                  ...prev,
                                  [lower]: {
                                    ...prev[lower],
                                    action: "assign",
                                    targetUserId: prev[lower]?.targetUserId || availableUsers[0]?.id,
                                  },
                                }))
                              }
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            <span>Einem bestehenden Profil zuweisen</span>
                          </label>

                          {currentMapping.action === "assign" && (
                            <div className="pl-6 pt-1">
                              <select
                                value={currentMapping.targetUserId || availableUsers[0]?.id}
                                onChange={(e) =>
                                  setMappings((prev) => ({
                                    ...prev,
                                    [lower]: { ...prev[lower], targetUserId: e.target.value },
                                  }))
                                }
                                className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                {availableUsers.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.displayName || u.username} ({u.role === "ADMIN" ? "Eltern" : "Kind"})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => {
                    setShowMappingModal(false)
                    setPendingText("")
                    setMissingOwners([])
                  }}
                  className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isImporting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                  <span>Importieren &amp; zuordnen</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
