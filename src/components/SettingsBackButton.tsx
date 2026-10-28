"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { logoutSettings } from "@/actions/auth"

export function SettingsBackButton({
  className,
}: {
  className?: string
}) {
  const [isLeaving, setIsLeaving] = useState(false)
  const router = useRouter()

  const handleBack = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (isLeaving) return
    setIsLeaving(true)
    try {
      await logoutSettings()
    } catch {
      // Ignore errors during logout
    }
    router.push("/")
  }

  const defaultClasses =
    "inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors min-w-0"

  return (
    <button
      type="button"
      onClick={handleBack}
      disabled={isLeaving}
      title="Zurück zur Übersicht (Einstellungen sperren)"
      className={className || defaultClasses}
    >
      {isLeaving ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : (
        <ArrowLeft className="w-4 h-4 shrink-0" />
      )}
      <span className="truncate">Zurück zur Übersicht</span>
    </button>
  )
}
