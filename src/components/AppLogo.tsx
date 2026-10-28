import React from "react"

interface AppLogoProps {
  size?: "sm" | "md" | "lg"
  className?: string
  asHeading?: boolean
  showText?: boolean
}

export function AppLogoIcon({
  className = "w-7 h-7 text-blue-600 dark:text-blue-500 shrink-0 translate-y-[2px]",
}: {
  className?: string
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z" />
      <line x1="12" y1="5" x2="12" y2="21" />
    </svg>
  )
}

export function AppLogo({
  size = "md",
  className = "",
  asHeading = false,
  showText = true,
}: AppLogoProps) {
  const iconSizeClasses = {
    sm: "w-5 h-5 text-blue-600 dark:text-blue-500 shrink-0 translate-y-[1px]",
    md: "w-6 h-6 text-blue-600 dark:text-blue-500 shrink-0 translate-y-[1.5px]",
    lg: "w-7 h-7 sm:w-8 sm:h-8 text-blue-600 dark:text-blue-500 shrink-0 translate-y-[2px]",
  }[size]

  const textSizeClasses = {
    sm: "text-lg font-bold tracking-tight leading-none select-none",
    md: "text-xl font-bold tracking-tight leading-none select-none",
    lg: "text-2xl sm:text-3xl font-bold tracking-tight leading-none select-none",
  }[size]

  const content = (
    <div className={`inline-flex items-center gap-2 sm:gap-2.5 ${className}`}>
      <AppLogoIcon className={iconSizeClasses} />
      {showText && (
        <span className={textSizeClasses}>
          <span className="text-slate-900 dark:text-slate-100">N30</span>
          <span className="text-blue-600 dark:text-blue-500">Vokabeltrainer</span>
        </span>
      )}
    </div>
  )

  if (asHeading) {
    return (
      <h1 className="inline-flex items-center m-0 p-0 font-normal">
        {content}
      </h1>
    )
  }

  return content
}
