"use client"

import { useState } from "react"
import {
  Users,
  User,
  UserPlus,
  Key,
  Trash2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserX,
  UserCheck,
  Loader2,
  CheckCircle,
  Plus,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react"
import {
  createUser,
  deleteUser,
  resetUserPassword,
  toggleUserActive,
  setupPrimaryAdmin,
  setupFamilySystem,
  convertSingleUserToFamily,
  changeUserRole,
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

  // Setup mode in single-user view: "family" (recommended) vs "single"
  const [setupMode, setSetupMode] = useState<"family" | "single">("family")

  // Family Setup State
  const [familyParentUsername, setFamilyParentUsername] = useState("eltern")
  const [familyParentPassword, setFamilyParentPassword] = useState("")
  const [familyParentPasswordConfirm, setFamilyParentPasswordConfirm] = useState("")
  const [familyChildUsername, setFamilyChildUsername] = useState("")
  const [familyChildDisplayName, setFamilyChildDisplayName] = useState("")
  const [familyChildPassword, setFamilyChildPassword] = useState("")
  const [isSettingUpFamily, setIsSettingUpFamily] = useState(false)

  // Setup Primary Admin State (Single User Mode)
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

  // Single User to Family Conversion State (when 1 user exists and adding 2nd child)
  const [convertParentUsername, setConvertParentUsername] = useState("eltern")
  const [convertParentPassword, setConvertParentPassword] = useState("")
  const [convertParentPasswordConfirm, setConvertParentPasswordConfirm] = useState("")
  const [convertChildUsername, setConvertChildUsername] = useState("")
  const [convertChildDisplayName, setConvertChildDisplayName] = useState("")
  const [convertChildPassword, setConvertChildPassword] = useState("")
  const [isConverting, setIsConverting] = useState(false)

  // Password Reset State
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editingPassword, setEditingPassword] = useState("")
  const [isResetting, setIsResetting] = useState(false)

  // Role Change Loading State
  const [roleChangingUserId, setRoleChangingUserId] = useState<string | null>(null)

  // Feedback Message
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Handle setting up family system (atomic Parent ADMIN + Child USER + Reassign decks)
  const handleSetupFamily = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (familyParentPassword !== familyParentPasswordConfirm) {
      setMessage({ type: "error", text: "Die Eltern-Passwörter stimmen nicht überein." })
      return
    }

    if (familyParentPassword.length < 8 || !/[^a-zA-Z0-9]/.test(familyParentPassword)) {
      setMessage({
        type: "error",
        text: "Das Eltern-Passwort muss mindestens 8 Zeichen lang sein und mindestens ein Sonderzeichen enthalten.",
      })
      return
    }

    if (familyChildPassword.length < 8 || !/[^a-zA-Z0-9]/.test(familyChildPassword)) {
      setMessage({
        type: "error",
        text: "Das Kinder-Passwort muss mindestens 8 Zeichen lang sein und mindestens ein Sonderzeichen enthalten.",
      })
      return
    }

    if (familyParentUsername.trim().toLowerCase() === familyChildUsername.trim().toLowerCase()) {
      setMessage({ type: "error", text: "Eltern- und Kinder-Benutzername müssen unterschiedlich sein." })
      return
    }

    setIsSettingUpFamily(true)
    try {
      const res = await setupFamilySystem({
        parentUsername: familyParentUsername,
        parentPassword: familyParentPassword,
        childUsername: familyChildUsername,
        childDisplayName: familyChildDisplayName || undefined,
        childPassword: familyChildPassword,
      })

      if (res.success) {
        setMessage({
          type: "success",
          text: `Familien-System erfolgreich eingerichtet! Eltern-Konto "${familyParentUsername}" und Kinder-Profil "${
            familyChildDisplayName || familyChildUsername
          }" wurden erstellt.`,
        })

        const totalDecks = data.users.reduce((acc, u) => acc + u.deckCount, 0)

        setData((prev) => ({
          ...prev,
          hasPrimaryAdmin: true,
          primaryAdminType: "db",
          primaryAdminUsername: familyParentUsername,
          users: [
            {
              id: res.parentId || "parent",
              username: familyParentUsername,
              displayName: "Eltern",
              role: "ADMIN",
              isActive: true,
              isEnvUser: false,
              isPrimaryAdmin: true,
              createdAt: new Date(),
              deckCount: 0,
            },
            {
              id: res.childId || "child",
              username: familyChildUsername,
              displayName: familyChildDisplayName || familyChildUsername,
              role: "USER",
              isActive: true,
              isEnvUser: false,
              isPrimaryAdmin: false,
              createdAt: new Date(),
              deckCount: totalDecks,
            },
          ],
        }))

        router.refresh()
      } else {
        setMessage({ type: "error", text: res.error || "Fehler beim Einrichten des Familien-Systems." })
      }
    } catch {
      setMessage({ type: "error", text: "Netzwerkfehler beim Einrichten des Familien-Systems." })
    } finally {
      setIsSettingUpFamily(false)
    }
  }

  // Handle setting up the primary admin (Single account mode)
  const handleSetupAdmin = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (setupPassword !== setupPasswordConfirm) {
      setMessage({ type: "error", text: "Die eingegebenen Passwörter stimmen nicht überein." })
      return
    }

    if (setupPassword.length < 8 || !/[^a-zA-Z0-9]/.test(setupPassword)) {
      setMessage({
        type: "error",
        text: "Das Passwort muss mindestens 8 Zeichen lang sein und mindestens ein Sonderzeichen enthalten.",
      })
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

  // Handle converting single protected user to family (creates Parent ADMIN, downgrades child to USER, adds 2nd child)
  const handleConvertFamily = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (convertParentPassword !== convertParentPasswordConfirm) {
      setMessage({ type: "error", text: "Die Eltern-Passwörter stimmen nicht überein." })
      return
    }

    if (convertParentPassword.length < 8 || !/[^a-zA-Z0-9]/.test(convertParentPassword)) {
      setMessage({
        type: "error",
        text: "Das Eltern-Passwort muss mindestens 8 Zeichen lang sein und mindestens ein Sonderzeichen enthalten.",
      })
      return
    }

    if (convertChildPassword.length < 8 || !/[^a-zA-Z0-9]/.test(convertChildPassword)) {
      setMessage({
        type: "error",
        text: "Das Passwort für das zweite Kind muss mindestens 8 Zeichen lang sein und mindestens ein Sonderzeichen enthalten.",
      })
      return
    }

    if (convertParentUsername.trim().toLowerCase() === convertChildUsername.trim().toLowerCase()) {
      setMessage({ type: "error", text: "Eltern- und Kinder-Benutzername müssen unterschiedlich sein." })
      return
    }

    setIsConverting(true)
    try {
      const res = await convertSingleUserToFamily({
        parentUsername: convertParentUsername,
        parentPassword: convertParentPassword,
        secondChildUsername: convertChildUsername,
        secondChildDisplayName: convertChildDisplayName || undefined,
        secondChildPassword: convertChildPassword,
      })

      if (res.success) {
        setMessage({
          type: "success",
          text: `Familien-System erfolgreich aktiviert! Eltern-Konto "${convertParentUsername}" angelegt, bisheriges Profil zum Kinder-Profil geändert und "${
            convertChildDisplayName || convertChildUsername
          }" als 2. Kind hinzugefügt.`,
        })

        const previousUser = data.users[0]
        setData((prev) => ({
          ...prev,
          hasPrimaryAdmin: true,
          primaryAdminType: "db",
          primaryAdminUsername: convertParentUsername,
          users: [
            {
              id: res.parentId || "parent",
              username: convertParentUsername,
              displayName: "Eltern",
              role: "ADMIN",
              isActive: true,
              isEnvUser: false,
              isPrimaryAdmin: true,
              createdAt: new Date(),
              deckCount: 0,
            },
            ...(previousUser
              ? [
                  {
                    ...previousUser,
                    role: "USER" as const,
                    isPrimaryAdmin: false,
                  },
                ]
              : []),
            {
              id: res.secondChildId || "second-child",
              username: convertChildUsername,
              displayName: convertChildDisplayName || convertChildUsername,
              role: "USER",
              isActive: true,
              isEnvUser: false,
              isPrimaryAdmin: false,
              createdAt: new Date(),
              deckCount: 0,
            },
          ],
        }))

        setShowCreateForm(false)
        router.refresh()
      } else {
        setMessage({ type: "error", text: res.error || "Fehler bei der Umstellung auf das Familien-System." })
      }
    } catch {
      setMessage({ type: "error", text: "Netzwerkfehler bei der Umstellung auf das Familien-System." })
    } finally {
      setIsConverting(false)
    }
  }

  // Handle changing user role
  const handleChangeRole = async (user: UserSummary, newRole: "ADMIN" | "USER") => {
    setMessage(null)

    if (newRole === "USER") {
      const confirmed = window.confirm(
        `Möchtest du das Profil "${user.displayName || user.username}" wirklich zum Kinder-Profil ändern?\n\nMit dem Passwort dieses Profils kann der Einstellungsbereich anschließend NICHT mehr entsperrt werden. Nur noch Eltern-Konten haben Zugriff auf die Einstellungen.`
      )
      if (!confirmed) return
    } else {
      const confirmed = window.confirm(
        `Möchtest du das Profil "${user.displayName || user.username}" zum Eltern-Profil befördern?\n\nDieses Profil erhält vollen Zugriff auf alle Einstellungen und die Kindersicherung.`
      )
      if (!confirmed) return
    }

    setRoleChangingUserId(user.id)
    try {
      const res = await changeUserRole(user.id, newRole)
      if (res.success) {
        setData((prev) => ({
          ...prev,
          users: prev.users.map((u) =>
            u.id === user.id
              ? {
                  ...u,
                  role: newRole,
                  isPrimaryAdmin: newRole === "ADMIN" ? u.isPrimaryAdmin : false,
                }
              : u
          ),
        }))
        setMessage({
          type: "success",
          text: `Rolle für "${user.displayName || user.username}" erfolgreich zu ${
            newRole === "ADMIN" ? "Eltern / Admin" : "Kinder-Profil"
          } geändert.`,
        })
        router.refresh()
      } else {
        setMessage({ type: "error", text: res.error || "Fehler beim Ändern der Rolle." })
      }
    } catch {
      setMessage({ type: "error", text: "Netzwerkfehler beim Ändern der Rolle." })
    } finally {
      setRoleChangingUserId(null)
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
      alert("Ein Administrator- bzw. Eltern-Profil kann nicht gelöscht werden.")
      return
    }

    if (
      !confirm(
        `Möchtest du das Profil "${user.displayName || user.username}" wirklich löschen? Alle zugehörigen Vokabelstapel werden dabei unwiderruflich gelöscht.`
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
        setMessage({ type: "success", text: `Profil "${user.displayName || user.username}" wurde gelöscht.` })
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
      alert("Ein Administrator- bzw. Eltern-Profil kann nicht deaktiviert werden.")
      return
    }

    setMessage(null)
    try {
      const res = await toggleUserActive(user.id)
      if (res.success) {
        setData((prev) => ({
          ...prev,
          users: prev.users.map((u) => (u.id === user.id ? { ...u, isActive: !u.isActive } : u)),
        }))
        setMessage({
          type: "success",
          text: `Profil "${user.displayName || user.username}" wurde ${user.isActive ? "deaktiviert" : "aktiviert"}.`,
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
  const activeAdminCount = data.users.filter((u) => (u.role === "ADMIN" || u.isEnvUser) && u.isActive).length

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-6 mt-8">
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
            <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 sm:p-5 mt-2 space-y-4">
              {/* Tab Selector */}
              <div className="flex border-b border-zinc-200 dark:border-zinc-700 gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setSetupMode("family")
                    setMessage(null)
                  }}
                  className={`pb-2.5 text-xs sm:text-sm font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
                    setupMode === "family"
                      ? "border-blue-600 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Familie mit Kindern (Empfohlen)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSetupMode("single")
                    setMessage(null)
                  }}
                  className={`pb-2.5 text-xs sm:text-sm font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
                    setupMode === "single"
                      ? "border-blue-600 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span>Nur für mich (Einzelnes Hauptkonto)</span>
                </button>
              </div>

              {setupMode === "family" ? (
                /* TAB A: Family setup */
                <form onSubmit={handleSetupFamily} className="space-y-4 pt-1">
                  <div className="bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-xl p-3 text-xs text-blue-900 dark:text-blue-200 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span>Saubere Trennung: Eltern-Schutz &amp; Kinder-Vokabeln</span>
                    </p>
                    <p className="text-zinc-600 dark:text-zinc-300">
                      Bestehende Vokabelstapel werden automatisch dem neuen Kinder-Profil zugeordnet. Du als Elternteil erhältst ein eigenes Passwort, mit dem nur du Einstellungen und Kindersicherung verwalten kannst.
                    </p>
                  </div>

                  {/* Section 1: Parent */}
                  <div className="space-y-2">
                    <div className="font-semibold text-xs text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>1. Eltern-Zugang (Einstellungen &amp; Kindersicherung)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                          Eltern-Anmeldename *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="z. B. eltern"
                          value={familyParentUsername}
                          onChange={(e) => setFamilyParentUsername(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                          Eltern-Passwort *
                        </label>
                        <input
                          type="password"
                          required
                          minLength={8}
                          placeholder="Mind. 8 Z. & 1 S.-Z."
                          value={familyParentPassword}
                          onChange={(e) => setFamilyParentPassword(e.target.value)}
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
                          value={familyParentPasswordConfirm}
                          onChange={(e) => setFamilyParentPasswordConfirm(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Child */}
                  <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                    <div className="font-semibold text-xs text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>2. Kinder-Profil (erhält bisherige Vokabelstapel)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                          Anmeldename des Kindes *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="z. B. anna oder max"
                          value={familyChildUsername}
                          onChange={(e) => setFamilyChildUsername(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                          Rufname (optional)
                        </label>
                        <input
                          type="text"
                          placeholder="z. B. Anna"
                          value={familyChildDisplayName}
                          onChange={(e) => setFamilyChildDisplayName(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                          Passwort für das Kind *
                        </label>
                        <input
                          type="password"
                          required
                          minLength={8}
                          placeholder="Mind. 8 Z. & 1 S.-Z."
                          value={familyChildPassword}
                          onChange={(e) => setFamilyChildPassword(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowSetupForm(false)}
                      className="w-full sm:w-auto px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-center"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="submit"
                      disabled={isSettingUpFamily}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {isSettingUpFamily ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      <span>{isSettingUpFamily ? "Wird eingerichtet..." : "Familien-System einrichten"}</span>
                    </button>
                  </div>
                </form>
              ) : (
                /* TAB B: Single User mode */
                <div>
                  <div className="mb-3">
                    <h4 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                      Persönliches Hauptkonto anlegen
                    </h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      Erstelle hier dein persönliches Hauptkonto. Deine bisherigen Vokabeln bleiben erhalten und werden diesem Konto zugewiesen.
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
                          Passwort *
                        </label>
                        <input
                          type="password"
                          required
                          minLength={8}
                          placeholder="Mind. 8 Z. & 1 S.-Z."
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
        </div>
      )}

      {/* CASE 2 & 3: PROTECTED USER (SINGLE OR MULTI) */}
      {data.hasPrimaryAdmin && (
        <div className="space-y-4">
          {/* Create form (when active) */}
          {showCreateForm && (
            isSingleUserProtected ? (
              <form
                onSubmit={handleConvertFamily}
                className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 space-y-4"
              >
                <div>
                  <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Auf Familien-System umstellen & zweites Kind hinzufügen</span>
                  </h4>
                  <div className="mt-2 p-3 bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-lg text-xs text-blue-900 dark:text-blue-200 space-y-1">
                    <p className="font-semibold">
                      Trennung von Eltern- und Kinder-Rechten
                    </p>
                    <p className="text-zinc-600 dark:text-zinc-300">
                      Aktuell nutzt <strong>{data.users[0]?.displayName || data.users[0]?.username}</strong> das einzige Profil und besitzt Administrator-Rechte. Durch das Anlegen deines Eltern-Kontos werden die Admin-Rechte auf die Eltern übertragen und das bisherige Profil wird zu einem Kinder-Profil ohne Zugriff auf die Einstellungen herabgestuft. Alle Vokabelstapel von {data.users[0]?.displayName || data.users[0]?.username} bleiben vollständig erhalten!
                    </p>
                  </div>
                </div>

                {/* Section 1: Parents */}
                <div className="space-y-2">
                  <div className="font-semibold text-xs text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>1. Neues Eltern-Hauptkonto (Kindersicherung &amp; Einstellungen)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        Eltern-Anmeldename *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="z. B. eltern"
                        value={convertParentUsername}
                        onChange={(e) => setConvertParentUsername(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        Eltern-Passwort *
                      </label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        placeholder="Mind. 8 Z. & 1 S.-Z."
                        value={convertParentPassword}
                        onChange={(e) => setConvertParentPassword(e.target.value)}
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
                        value={convertParentPasswordConfirm}
                        onChange={(e) => setConvertParentPasswordConfirm(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Second Child */}
                <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                  <div className="font-semibold text-xs text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>2. Zweites Kind (erhält eigenen Lernbereich)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        Anmeldename des 2. Kindes *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="z. B. anna oder max"
                        value={convertChildUsername}
                        onChange={(e) => setConvertChildUsername(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        Rufname (optional)
                      </label>
                      <input
                        type="text"
                        placeholder="z. B. Anna"
                        value={convertChildDisplayName}
                        onChange={(e) => setConvertChildDisplayName(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        Passwort für das 2. Kind *
                      </label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        placeholder="Mind. 8 Z. & 1 S.-Z."
                        value={convertChildPassword}
                        onChange={(e) => setConvertChildPassword(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="w-full sm:w-auto px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-center"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    disabled={isConverting}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {isConverting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span>{isConverting ? "Wird umgestellt..." : "Eltern-Konto anlegen & zweites Kind hinzufügen"}</span>
                  </button>
                </div>
              </form>
            ) : (
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
                      placeholder="Mind. 8 Z. & 1 S.-Z."
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
            )
          )}

          {/* User profile list / card */}
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {data.users.map((u) => {
              const isAdmin = u.isPrimaryAdmin || u.isEnvUser || u.role === "ADMIN"

              return (
                <div
                  key={u.id}
                  className={`py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isAdmin ? "bg-zinc-50/70 dark:bg-zinc-800/40 -mx-2 px-2.5 rounded-lg" : ""
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                      {isAdmin ? (
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
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            isAdmin
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                          }`}
                        >
                          {isAdmin ? "Eltern / Admin" : "Kinder-Profil"}
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
                  <div className="flex items-center gap-2 self-start sm:self-center pl-12 sm:pl-0 flex-wrap">
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
                            <span className="hidden sm:inline">Passwort</span>
                          </button>
                        )}

                        {/* Role Change Button */}
                        {!u.isEnvUser && (
                          u.role === "ADMIN" ? (
                            <button
                              type="button"
                              disabled={activeAdminCount <= 1 || roleChangingUserId === u.id}
                              onClick={() => handleChangeRole(u, "USER")}
                              title={
                                activeAdminCount <= 1
                                  ? "Mindestens ein aktives Eltern-Konto muss erhalten bleiben."
                                  : "Zu Kinder-Profil ändern (kann Einstellungen nicht mehr entsperren)"
                              }
                              className="p-1.5 text-zinc-500 hover:text-amber-600 dark:hover:text-amber-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {roleChangingUserId === u.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                              )}
                              <span className="hidden sm:inline">Zu Kind ändern</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={roleChangingUserId === u.id}
                              onClick={() => handleChangeRole(u, "ADMIN")}
                              title="Zu Eltern-Profil befördern (erhält Zugriff auf Einstellungen)"
                              className="p-1.5 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1 text-xs disabled:opacity-40"
                            >
                              {roleChangingUserId === u.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                              )}
                              <span className="hidden sm:inline">Zu Eltern ändern</span>
                            </button>
                          )
                        )}

                        {/* Secondary users only: toggle active / delete */}
                        {u.role !== "ADMIN" && !u.isEnvUser && (
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
