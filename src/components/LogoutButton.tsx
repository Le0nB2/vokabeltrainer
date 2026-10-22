"use client"

import { useState } from "react"
import { LogOut, Loader2 } from "lucide-react"
import { logoutApp } from "@/actions/auth"

export function LogoutButton({
  className,
  showLabel = false,
  labelClassName,
}: {
  className?: string
  showLabel?: boolean
  labelClassName?: string
}) {
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await logoutApp()
      window.location.href = "/login"
    } catch {
      window.location.href = "/login"
    }
  }

  const defaultClasses =
    "inline-flex items-center gap-1.5 text-zinc-500 hover:text-red-600 dark:hover:text-red-400 transition-colors p-2 rounded-lg text-sm"

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoggingOut}
      title="Abmelden"
      aria-label="Abmelden"
      className={className || defaultClasses}
    >
      {isLoggingOut ? (
        <Loader2 className="w-5 h-5 animate-spin shrink-0" />
      ) : (
        <LogOut className="w-5 h-5 shrink-0" />
      )}
      {showLabel && (
        <span className={labelClassName}>
          {isLoggingOut ? "Wird abgemeldet..." : "Abmelden"}
        </span>
      )}
    </button>
  )
}
