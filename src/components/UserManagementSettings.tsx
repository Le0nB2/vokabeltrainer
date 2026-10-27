"use client"

import { useState } from "react"
import {
  Users,
  User,
  UserPlus,
  Key,
  Trash2,
  Shield,
  UserX,
  UserCheck,
  Loader2,
  CheckCircle,
  Plus,
  ChevronDown,
  ChevronUp,
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
  const [showSetupForm, setShowSetupForm] = useState(false)

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

    if (setupPassword.length < 8 || !/[^a-zA-Z0-9]/.test(setupPassword)) {
      setMessage({ type: "error", text: "Das Passwort muss mindestens 8 Zeichen lang sein und mindestens ein Sonderzeichen enthalten." })
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
              displayName: null,
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
    if (!editingPassword || editingPassword.length < 8 || !/[^a-zA-Z0-9]/.test(editingPassword)) {
      alert("Das neue Passwort muss mindestens 8 Zeichen lang sein und mindestens ein Sonderzeichen enthalten.")
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

  const isMultiUser = data.hasPrimaryAdmin && data.users.length > 1
  const isSingleUserProtected = data.hasPrimaryAdmin && data.users.length <= 1
  const isSingleUserUnprotected = !data.hasPrimaryAdmin

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-6 mb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg shrink-0">
            {isMultiUser ? (
              <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            ) : isSingleUserProtected ? (
              <UserCheck className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            ) : (
              <User className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {isMultiUser
                  ? "Profile & Konten"
                  : isSingleUserProtected
                  ? "Dein Profil"
                  : "Benutzerprofil (optional)"}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                {isMultiUser
                  ? `${data.users.length} Profile`
                  : isSingleUserProtected
                  ? "Passwortgeschützt"
                  : "Einzelnutzer"}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
              {isMultiUser
                ? "Hier verwaltest du alle Profile mit getrennten Vokabelstapeln."
                : isSingleUserProtected
                ? "Dein persönlicher Bereich ist aktiv und passwortgeschützt."
                : "Du nutzt den Vokabeltrainer im Einzelnutzer-Modus ganz ohne Login."}
            </p>
          </div>
        </div>

        {/* In Multi-User mode: Prominent Header Button */}
        {isMultiUser && (
          <button
            type="button"
            onClick={() => {
              setShowCreateForm(!showCreateForm)
              setMessage(null)
            }}
            className="shrink-0 inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto"
          >
            <UserPlus className="w-4 h-4" />
            <span>{showCreateForm ? "Formular schließen" : "Profil hinzufügen"}</span>
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

      {/* CASE 1: UNPROTECTED SINGLE USER MODE */}
      {isSingleUserUnprotected && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 text-sm space-y-1">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
              <span>Einzelnutzer-Modus aktiv</span>
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 text-xs sm:text-sm leading-relaxed">
              Alle Vokabeln und Lernfunktionen stehen direkt zur Verfügung. Du brauchst kein Passwort und kein Login.
            </p>
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowSetupForm(!showSetupForm)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              {showSetupForm ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  <span>Einrichtung abbrechen</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  <span>Passwortschutz oder getrennte Profile einrichten (optional)</span>
                </>
              )}
            </button>
          </div>

          {showSetupForm && (
            <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 sm:p-5 mt-2 space-y-3">
              <div>
                <h4 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                  Persönliches Hauptkonto anlegen
                </h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Erstelle hier dein persönliches Eltern- oder Hauptkonto. Deine bisherigen Vokabeln bleiben zu 100% erhalten. Anschließend kannst du bei Bedarf weitere Profile für Kinder hinzufügen.
                </p>
              </div>

              <form onSubmit={handleSetupAdmin} className="space-y-4 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                      Anmeldename *
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
                      Passwort (mind. 8 Zeichen & 1 Sonderzeichen) *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      placeholder="Mind. 8 Zeichen & 1 Sonderzeichen"
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
                      minLength={8}
                      placeholder="Passwort wiederholen"
                      value={setupPasswordConfirm}
                      onChange={(e) => setSetupPasswordConfirm(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSetupForm(false)}
                    className="w-full sm:w-auto px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-center"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    disabled={isSettingUpAdmin}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {isSettingUpAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                    <span>{isSettingUpAdmin ? "Wird eingerichtet..." : "Konto anlegen & aktivieren"}</span>
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
          )}
        </div>
      )}

      {/* CASE 2 & 3: PROTECTED USER (SINGLE OR MULTI) */}
      {data.hasPrimaryAdmin && (
        <div className="space-y-4">
          {/* Create form (when active) */}
          {showCreateForm && (
            <form
              onSubmit={handleCreate}
              className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 space-y-4"
            >
              <div>
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Neues Profil anlegen
                </h4>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Dieses Profil erhält einen eigenen Lernbereich mit separaten Vokabelstapeln und eigenem Lernfortschritt.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Anmeldename *
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
                    Rufname / Vorname (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="z. B. Leon"
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
                    minLength={8}
                    placeholder="Mind. 8 Zeichen & 1 Sonderzeichen"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="w-full sm:w-auto px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-center"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  <span>{isCreating ? "Wird erstellt..." : "Profil speichern"}</span>
                </button>
              </div>
            </form>
          )}

          {/* User profile list / card */}
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {data.users.map((u) => {
              const isPrimary = u.isPrimaryAdmin || u.isEnvUser || u.role === "ADMIN"

              return (
                <div
                  key={u.id}
                  className={`py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isPrimary ? "bg-zinc-50/70 dark:bg-zinc-800/40 -mx-2 px-2.5 rounded-lg" : ""
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                      {isPrimary ? (
                        <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <span className="font-semibold text-sm text-zinc-700 dark:text-zinc-300 uppercase">
                          {u.username.slice(0, 2)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                          {u.displayName || u.username}
                        </span>
                        {u.displayName && u.displayName !== u.username && (
                          <span className="text-xs text-zinc-400">({u.username})</span>
                        )}

                        {/* Badges */}
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                          {isPrimary ? "Hauptprofil" : "Lernprofil"}
                        </span>

                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            u.isActive
                              ? "bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300"
                              : "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                          }`}
                        >
                          {u.isActive ? "Aktiv" : "Deaktiviert"}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{u.deckCount} {u.deckCount === 1 ? "Stapel" : "Stapel"}</span>
                        {u.lastLoginAt && (
                          <span>· Letzter Login: {new Date(u.lastLoginAt).toLocaleDateString("de-DE")}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-start sm:self-center pl-12 sm:pl-0">
                    {/* Inline password edit form */}
                    {editingUserId === u.id ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="password"
                          placeholder="Mind. 8 Z. & 1 S.-Z."
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
                        {!u.isEnvUser && (
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
                            <span className="inline">Passwort ändern</span>
                          </button>
                        )}

                        {/* Secondary users only: toggle active / delete */}
                        {!isPrimary && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(u)}
                              title={u.isActive ? "Profil deaktivieren" : "Profil aktivieren"}
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
                              title="Profil löschen"
                              className="p-1.5 text-zinc-500 hover:text-red-600 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* In Single-User Protected Mode: Discreet button to add another profile */}
          {isSingleUserProtected && !showCreateForm && (
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(true)
                  setMessage(null)
                }}
                className="inline-flex items-center gap-2 text-xs font-medium text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-1"
              >
                <Plus className="w-4 h-4" />
                <span>Weiteres Profil hinzufügen (optional, z. B. für Kinder)</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
