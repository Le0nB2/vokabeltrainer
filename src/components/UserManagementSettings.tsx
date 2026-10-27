"use client"

import { useState } from "react"
import { Users, UserPlus, Key, Trash2, Shield, UserX, UserCheck, Loader2 } from "lucide-react"
import {
  createUser,
  deleteUser,
  resetUserPassword,
  toggleUserActive,
  UserSummary,
} from "@/actions/users"
import { useRouter } from "next/navigation"

export function UserManagementSettings({
  initialUsers,
}: {
  initialUsers: UserSummary[]
}) {
  const [users, setUsers] = useState<UserSummary[]>(initialUsers)
  const [isCreating, setIsCreating] = useState(false)
  const [newUsername, setNewUsername] = useState("")
  const [newDisplayName, setNewDisplayName] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editingPassword, setEditingPassword] = useState("")
  const [isResetting, setIsResetting] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const router = useRouter()

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

  const handleDelete = async (user: UserSummary) => {
    if (!confirm(`Möchtest du den Benutzer "${user.username}" wirklich löschen? Alle zugehörigen Vokabelstapel werden dabei unwiderruflich gelöscht.`)) {
      return
    }

    setMessage(null)
    try {
      const res = await deleteUser(user.id)
      if (res.success) {
        setUsers((prev) => prev.filter((u) => u.id !== user.id))
        setMessage({ type: "success", text: `Benutzer "${user.username}" wurde gelöscht.` })
        router.refresh()
      } else {
        setMessage({ type: "error", text: res.error || "Fehler beim Löschen des Benutzers." })
      }
    } catch {
      setMessage({ type: "error", text: "Netzwerkfehler beim Löschen des Benutzers." })
    }
  }

  const handleToggleActive = async (user: UserSummary) => {
    setMessage(null)
    try {
      const res = await toggleUserActive(user.id)
      if (res.success) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, isActive: !u.isActive } : u))
        )
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
              Zugänge verwalten. Jeder Benutzer erhält eigene Vokabelstapel.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowCreateForm(!showCreateForm)
            setMessage(null)
          }}
          className="shrink-0 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          <span>Nutzer anlegen</span>
        </button>
      </div>

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

      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="p-4 mb-6 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 space-y-4"
        >
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Neuen Benutzer anlegen
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Benutzername *
              </label>
              <input
                type="text"
                required
                placeholder="z. B. anna"
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
                placeholder="z. B. Anna Müller"
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

      {/* Users List */}
      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {users.map((u) => (
          <div
            key={u.id}
            className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                {u.isEnvUser ? (
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
                  {u.isEnvUser ? (
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                      System-Admin (Render)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                      Benutzer
                    </span>
                  )}
                  {!u.isEnvUser && (
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

            {/* Actions for database users */}
            {!u.isEnvUser && (
              <div className="flex items-center gap-2 self-end sm:self-center">
                {editingUserId === u.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      placeholder="Neues PW"
                      value={editingPassword}
                      onChange={(e) => setEditingPassword(e.target.value)}
                      className="px-2 py-1 text-xs border rounded dark:bg-zinc-800 dark:border-zinc-700 w-28"
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
                    <button
                      type="button"
                      onClick={() => {
                        setEditingUserId(u.id)
                        setEditingPassword("")
                      }}
                      title="Passwort ändern"
                      className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <Key className="w-4 h-4" />
                    </button>
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
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
