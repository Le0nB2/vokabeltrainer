"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Lock, Loader2 } from "lucide-react"
import { logoutSettings } from "@/actions/auth"

export function LockSettingsButton({
  className,
}: {
  className?: string
}) {
  const [isLocking, setIsLocking] = useState(false)
  const router = useRouter()

  const handleLock = async () => {
    if (isLocking) return
    setIsLocking(true)
    try {
      await logoutSettings()
      router.refresh()
    } catch {
      setIsLocking(false)
    }
  }

  const defaultClasses =
    "shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-sm font-medium transition-colors"

  return (
    <button
      type="button"
      onClick={handleLock}
      disabled={isLocking}
      title="Einstellungen sperren"
      aria-label="Einstellungen sperren"
      className={className || defaultClasses}
    >
      {isLocking ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : (
        <Lock className="w-4 h-4 shrink-0" />
      )}
      <span>
        {isLocking ? (
          "Wird gesperrt..."
        ) : (
          <>
            <span className="hidden sm:inline">Einstellungen </span>sperren
          </>
        )}
      </span>
    </button>
  )
}
