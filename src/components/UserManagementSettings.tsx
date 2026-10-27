"use client"

import { useState } from "react"
import {
  Users,
  UserPlus,
  Key,
  Trash2,
  Shield,
  UserX,
  UserCheck,
  Loader2,
  AlertTriangle,
  CheckCircle,
} from "lucide-react"
import {
  createUser,
  deleteUser,
  resetUserPassword,
  toggleUserActive,
  setupPrimaryAdmin,
  UserSummary,
  UserManagementData,
} from "@/actions/users"
import { useRouter } from "next/navigation"

export function UserManagementSettings({
  initialData,
  initialUsers,
}: {
  initialData?: UserManagementData
  initialUsers?: UserSummary[]
}) {
  const router = useRouter()

  // Normalize initial data
  const defaultData: UserManagementData = initialData || {
    hasPrimaryAdmin: Boolean(initialUsers?.some((u) => u.isPrimaryAdmin || u.isEnvUser || u.role === "ADMIN")),
    primaryAdminType: initialUsers?.find((u) => u.isEnvUser)
      ? "env"
      : initialUsers?.find((u) => u.role === "ADMIN")
      ? "db"
      : null,
    isEnvConfigured: Boolean(initialUsers?.some((u) => u.isEnvUser)),
    users: initialUsers || [],
  }

  const [data, setData] = useState<UserManagementData>(defaultData)

  // Setup Primary Admin State (Option 1)
  const [setupUsername, setSetupUsername] = useState("")
  const [setupPassword, setSetupPassword] = useState("")
  const [setupPasswordConfirm, setSetupPasswordConfirm] = useState("")
  const [isSettingUpAdmin, setIsSettingUpAdmin] = useState(false)

  // Secondary User Creation State
  const [isCreating, setIsCreating] = useState(false)
  const [newUsername, setNewUsername] = useState("")
  const [newDisplayName, setNewDisplayName] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [showCreateForm, setShowCreateForm] = useState(false)

  // Password Reset State
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editingPassword, setEditingPassword] = useState("")
  const [isResetting, setIsResetting] = useState(false)

  // Feedback Message
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Handle setting up the primary admin
  const handleSetupAdmin = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (setupPassword !== setupPasswordConfirm) {
      setMessage({ type: "error", text: "Die eingegebenen Passwörter stimmen nicht überein." })
      return
    }

    if (setupPassword.length < 6) {
      setMessage({ type: "error", text: "Das Passwort muss mindestens 6 Zeichen lang sein." })
      return
    }

    setIsSettingUpAdmin(true)
    try {
      const res = await setupPrimaryAdmin({
        username: setupUsername,
        password: setupPassword,
      })

      if (res.success) {
        setMessage({
          type: "success",
          text: `Hauptnutzer "${setupUsername}" erfolgreich eingerichtet! Du bist jetzt als Hauptnutzer angemeldet.`,
        })
        setSetupUsername("")
        setSetupPassword("")
        setSetupPasswordConfirm("")

        // Update local state so view switches immediately
        setData((prev) => ({
          ...prev,
          hasPrimaryAdmin: true,
          primaryAdminType: "db",
          primaryAdminUsername: setupUsername,
          users: [
            {
              id: res.userId || "primary-admin",
              username: setupUsername,
              displayName: "Hauptnutzer",
              role: "ADMIN",
              isActive: true,
              isEnvUser: false,
              isPrimaryAdmin: true,
              createdAt: new Date(),
              deckCount: prev.users.reduce((acc, u) => acc + u.deckCount, 0),
            },
            ...prev.users.filter((u) => u.username !== setupUsername),
          ],
        }))

        router.refresh()
      } else {
        setMessage({ type: "error", text: res.error || "Fehler beim Einrichten des Hauptnutzers." })
      }
    } catch {
      setMessage({ type: "error", text: "Netzwerkfehler beim Einrichten des Hauptnutzers." })
    } finally {
      setIsSettingUpAdmin(false)
    }
  }

  // Handle creating secondary user
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    setIsCreating(true)

    try {
      const res = await createUser({
        username: newUsername,
        password: newPassword,
        displayName: newDisplayName || undefined,
      })

      if (res.success) {
        setMessage({ type: "success", text: `Benutzer "${newUsername}" erfolgreich angelegt!` })
        setNewUsername("")
        setNewDisplayName("")
        setNewPassword("")
        setShowCreateForm(false)

        setData((prev) => ({
          ...prev,
          users: [
            ...prev.users,
            {
              id: res.userId || Math.random().toString(),
              username: newUsername,
              displayName: newDisplayName || null,
              role: "USER",
              isActive: true,
              isEnvUser: false,
              isPrimaryAdmin: false,
              createdAt: new Date(),
              deckCount: 0,
            },
          ],
        }))

        router.refresh()
      } else {
        setMessage({ type: "error", text: res.error || "Fehler beim Anlegen des Benutzers." })
      }
    } catch {
      setMessage({ type: "error", text: "Netzwerkfehler beim Anlegen des Benutzers." })
    } finally {
      setIsCreating(false)
    }
  }

  // Handle deleting a secondary user
  const handleDelete = async (user: UserSummary) => {
    if (user.isPrimaryAdmin || user.isEnvUser || user.role === "ADMIN") {
      alert("Der Hauptnutzer kann nicht gelöscht werden.")
      return
    }

    if (
      !confirm(
        `Möchtest du den Benutzer "${user.username}" wirklich löschen? Alle zugehörigen Vokabelstapel werden dabei unwiderruflich gelöscht.`
      )
    ) {
      return
    }

    setMessage(null)
    try {
      const res = await deleteUser(user.id)
      if (res.success) {
        setData((prev) => ({
          ...prev,
          users: prev.users.filter((u) => u.id !== user.id),
        }))
        setMessage({ type: "success", text: `Benutzer "${user.username}" wurde gelöscht.` })
        router.refresh()
      } else {
        setMessage({ type: "error", text: res.error || "Fehler beim Löschen des Benutzers." })
      }
    } catch {
      setMessage({ type: "error", text: "Netzwerkfehler beim Löschen des Benutzers." })
    }
  }

  // Handle toggling active state of a secondary user
  const handleToggleActive = async (user: UserSummary) => {
    if (user.isPrimaryAdmin || user.isEnvUser || user.role === "ADMIN") {
      alert("Der Hauptnutzer kann nicht deaktiviert werden.")
      return
    }

    setMessage(null)
    try {
      const res = await toggleUserActive(user.id)
      if (res.success) {
        setData((prev) => ({
          ...prev,
          users: prev.users.map((u) =>
            u.id === user.id ? { ...u, isActive: !u.isActive } : u
          ),
        }))
        setMessage({
          type: "success",
          text: `Benutzer "${user.username}" wurde ${user.isActive ? "deaktiviert" : "aktiviert"}.`,
        })
        router.refresh()
      } else {
        setMessage({ type: "error", text: res.error || "Fehler beim Aktualisieren des Status." })
      }
    } catch {
      setMessage({ type: "error", text: "Netzwerkfehler beim Aktualisieren des Status." })
    }
  }

  // Handle resetting a user's password
  const handleResetPassword = async (userId: string) => {
    if (!editingPassword || editingPassword.length < 4) {
      alert("Das neue Passwort muss mindestens 4 Zeichen lang sein.")
      return
    }

    setIsResetting(true)
    setMessage(null)
    try {
      const res = await resetUserPassword(userId, editingPassword)
      if (res.success) {
        setMessage({ type: "success", text: "Passwort erfolgreich geändert!" })
        setEditingUserId(null)
        setEditingPassword("")
      } else {
        setMessage({ type: "error", text: res.error || "Fehler beim Zurücksetzen des Passworts." })
      }
    } catch {
      setMessage({ type: "error", text: "Netzwerkfehler beim Ändern des Passworts." })
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 mt-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg shrink-0">
            <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              Benutzerverwaltung
            </h3>
            <p className="text-sm text-zinc-500 truncate">
              {data.hasPrimaryAdmin
                ? "Profile für dich und deine Kinder mit getrennten Vokabelstapeln verwalten."
                : "Für die Nutzung mehrerer Profile muss zuerst ein Hauptnutzer festgelegt werden."}
            </p>
          </div>
        </div>

        {data.hasPrimaryAdmin && (
          <button
            type="button"
            onClick={() => {
              setShowCreateForm(!showCreateForm)
              setMessage(null)
            }}
            className="shrink-0 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>Weiteren Nutzer anlegen</span>
          </button>
        )}
      </div>

      {/* Global Feedback Message */}
      {message && (
        <div
          className={`p-3 rounded-lg text-sm mb-4 ${
            message.type === "success"
              ? "bg-green-100 text-green-800 border border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800"
              : "bg-red-100 text-red-800 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* CASE 1: NO PRIMARY ADMIN CONFIGURED */}
      {!data.hasPrimaryAdmin && (
        <div className="space-y-6">
          {/* Explanation Alert */}
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-sm space-y-2">
            <div className="flex items-center gap-2 font-semibold text-base text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Erst Hauptnutzer einrichten</span>
            </div>
            <p className="leading-relaxed">
              Aktuell ist für diesen Vokabeltrainer noch kein <strong>Hauptnutzer (Administrator/Eltern)</strong> eingerichtet. Die App läuft daher im ungeschützten Einzelnutzer-Modus.
            </p>
            <p className="leading-relaxed">
              Damit du weitere Profile (z. B. für deine Kinder) anlegen kannst und jeder nur seine eigenen Vokabeln und Lernfortschritte sieht, muss zuerst der Hauptnutzer festgelegt werden.
            </p>
            <p className="text-xs text-amber-800/90 dark:text-amber-300/90 font-medium pt-1">
              ✓ Deine bisherigen Vokabeln und Lernstände bleiben zu 100% erhalten und gehören automatisch dem neuen Hauptnutzer!
            </p>
          </div>

          {/* Create directly in Settings */}
          <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl p-5">
            <h4 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 mb-1">
              Hauptnutzer anlegen
            </h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              Gib einen Benutzernamen und ein sicheres Passwort ein. Mit diesen Daten loggst du dich künftig als Eltern- bzw. Administrator-Konto ein.
            </p>

            <form onSubmit={handleSetupAdmin} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Benutzername des Hauptnutzers *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="z. B. eltern oder dein Name"
                    value={setupUsername}
                    onChange={(e) => setSetupUsername(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Passwort (mind. 6 Zeichen) *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Geheimes Passwort"
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Passwort wiederholen *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Passwort wiederholen"
                    value={setupPasswordConfirm}
                    onChange={(e) => setSetupPasswordConfirm(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSettingUpAdmin}
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {isSettingUpAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  <span>{isSettingUpAdmin ? "Wird eingerichtet..." : "Hauptnutzer anlegen & aktivieren"}</span>
                </button>
              </div>
            </form>

            {data.users.length > 0 && (
              <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Bereits vorhandenes Konto übernehmen:
                </p>
                <div className="flex flex-wrap gap-2">
                  {data.users.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSetupUsername(u.username)}
                      className="text-xs bg-zinc-200 hover:bg-blue-100 dark:bg-zinc-700 dark:hover:bg-blue-900/40 text-zinc-800 dark:text-zinc-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Shield className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>&quot;{u.username}&quot; als Hauptnutzer übernehmen</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CASE 2: PRIMARY ADMIN IS CONFIGURED */}
      {data.hasPrimaryAdmin && (
        <div className="space-y-4">
          {/* Status info bar */}
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>
              {data.primaryAdminType === "env"
                ? "Hauptnutzer ist über die Server-Umgebung (Render / Docker) geschützt und aktiv."
                : "Hauptnutzer ist als geschütztes Administratorkonto eingerichtet."}
            </span>
          </div>

          {/* Form to create a secondary user (child) */}
          {showCreateForm && (
            <form
              onSubmit={handleCreate}
              className="p-4 mb-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 space-y-4"
            >
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Neuen Benutzer anlegen (z. B. für ein Kind)
              </h4>
              <p className="text-xs text-zinc-500">
                Dieser Benutzer erhält einen eigenen, isolierten Lernbereich mit separaten Vokabelstapeln und eigenem Lernfortschritt.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Benutzername *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="z. B. leon"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Anzeigename (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="z. B. Leon B."
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Passwort *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Mind. 4 Zeichen"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  <span>{isCreating ? "Wird erstellt..." : "Benutzer speichern"}</span>
                </button>
              </div>
            </form>
          )}

          {/* Users List Table */}
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {data.users.map((u) => {
              const isPrimary = u.isPrimaryAdmin || u.isEnvUser || u.role === "ADMIN"

              return (
                <div
                  key={u.id}
                  className={`py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isPrimary ? "bg-zinc-50/70 dark:bg-zinc-800/40 -mx-2 px-2 rounded-lg" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                      {isPrimary ? (
                        <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <span className="font-semibold text-sm text-zinc-700 dark:text-zinc-300 uppercase">
                          {u.username.slice(0, 2)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-zinc-900 dark:text-zinc-100 text-sm">
                          {u.displayName || u.username}
                        </span>
                        {u.displayName && (
                          <span className="text-xs text-zinc-400">({u.username})</span>
                        )}

                        {/* Badges */}
                        {u.isEnvUser ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            Hauptnutzer (Server-Umgebung)
                          </span>
                        ) : u.isPrimaryAdmin || u.role === "ADMIN" ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                            Hauptnutzer (Administrator)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            Benutzer
                          </span>
                        )}

                        {isPrimary ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300">
                            Aktiv (Geschützt)
                          </span>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                              u.isActive
                                ? "bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300"
                                : "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                            }`}
                          >
                            {u.isActive ? "Aktiv" : "Deaktiviert"}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {u.deckCount} {u.deckCount === 1 ? "Stapel" : "Stapel"}
                        {u.lastLoginAt && (
                          <> · Letzter Login: {new Date(u.lastLoginAt).toLocaleDateString("de-DE")}</>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {/* Inline password edit form */}
                    {editingUserId === u.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          placeholder="Neues Passwort"
                          value={editingPassword}
                          onChange={(e) => setEditingPassword(e.target.value)}
                          className="px-2 py-1 text-xs border rounded dark:bg-zinc-800 dark:border-zinc-700 w-32"
                        />
                        <button
                          type="button"
                          disabled={isResetting}
                          onClick={() => handleResetPassword(u.id)}
                          className="text-xs px-2.5 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          Speichern
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUserId(null)
                            setEditingPassword("")
                          }}
                          className="text-xs px-2 py-1 text-zinc-500 hover:text-zinc-700"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Primary Environment User has no UI actions */}
                        {u.isEnvUser ? (
                          <span className="text-xs text-zinc-400 italic px-2">
                            Über Render / Docker verwaltet
                          </span>
                        ) : (
                          <>
                            {/* Password edit button */}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUserId(u.id)
                                setEditingPassword("")
                              }}
                              title="Passwort ändern"
                              className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1 text-xs"
                            >
                              <Key className="w-4 h-4" />
                              <span className="hidden sm:inline">Passwort</span>
                            </button>

                            {/* Secondary users only: toggle active / delete */}
                            {!isPrimary && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleToggleActive(u)}
                                  title={u.isActive ? "Benutzer deaktivieren" : "Benutzer aktivieren"}
                                  className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                >
                                  {u.isActive ? (
                                    <UserX className="w-4 h-4 text-amber-600" />
                                  ) : (
                                    <UserCheck className="w-4 h-4 text-green-600" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(u)}
                                  title="Benutzer löschen"
                                  className="p-1.5 text-zinc-500 hover:text-red-600 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
