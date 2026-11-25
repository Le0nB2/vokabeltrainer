"use client"

import { CheckCircle2, Clock, Loader2, Sparkles } from "lucide-react"
import type { AnalysisBlock, BlockStatus } from "@/lib/enrich-blocks"

interface AnalysisBlocksPanelProps {
  blocks: AnalysisBlock<any>[]
  statusText?: string
}

const STATUS_BADGE: Record<
  BlockStatus,
  { label: string; badgeClass: string; rowClass: string }
> = {
  analyzing: {
    label: "In Analyse",
    badgeClass:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 border border-blue-300 dark:border-blue-700",
    rowClass:
      "border-blue-300 bg-blue-50/70 dark:border-blue-700 dark:bg-blue-950/30",
  },
  queued: {
    label: "Warteschlange",
    badgeClass:
      "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700",
    rowClass:
      "border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/40",
  },
  done: {
    label: "Fertig",
    badgeClass:
      "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200 border border-green-300 dark:border-green-800",
    rowClass:
      "border-green-200 bg-green-50/40 dark:border-green-900/50 dark:bg-green-950/20",
  },
  background: {
    label: "Hintergrund",
    badgeClass:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border border-amber-300 dark:border-amber-800",
    rowClass:
      "border-amber-200 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20",
  },
}

/**
 * Renders live progress and per-block status showing which vocabulary blocks
 * are currently queued, actively analyzed, completed, or handed off to background processing.
 */
export function AnalysisBlocksPanel({ blocks, statusText }: AnalysisBlocksPanelProps) {
  if (!blocks || blocks.length === 0) return null

  const totalCards = blocks.reduce((sum, b) => sum + b.cards.length, 0)
  const completedCards = blocks
    .filter((b) => b.status === "done")
    .reduce((sum, b) => sum + b.cards.length, 0)
  const activeBlock = blocks.find((b) => b.status === "analyzing")
  const hasActiveOrQueued = blocks.some(
    (b) => b.status === "analyzing" || b.status === "queued"
  )

  return (
    <div
      className="mb-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60 p-3.5 space-y-2.5"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium">
        <div className="flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
          {hasActiveOrQueued ? (
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-pulse shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
          )}
          <span>
            {statusText ||
              (activeBlock
                ? `Analysiere Block ${activeBlock.index + 1}/${blocks.length} (Vokabeln ${activeBlock.startNumber}–${activeBlock.endNumber})`
                : `Analyse abgeschlossen: ${completedCards}/${totalCards} Vokabeln mit Eselsbrücke`)}
          </span>
        </div>
        <span className="text-zinc-500 dark:text-zinc-400 tabular-nums">
          {completedCards} / {totalCards} fertig
        </span>
      </div>

      <progress
        value={completedCards}
        max={Math.max(1, totalCards)}
        aria-label="Fortschritt der KI-Analyse nach Vokabelblöcken"
        className="w-full h-2 accent-blue-600 block"
      />

      <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
        {blocks.map((block) => {
          const style = STATUS_BADGE[block.status]
          const previewWords = block.cards
            .slice(0, 4)
            .map((c) => c.front)
            .join(", ")
          const extraCount = Math.max(0, block.cards.length - 4)

          return (
            <div
              key={block.index}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5 text-xs transition-colors ${style.rowClass}`}
            >
              <div className="min-w-0 flex-1 truncate">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100 mr-2">
                  Block {block.index + 1} ({block.startNumber}–{block.endNumber}):
                </span>
                <span className="text-zinc-600 dark:text-zinc-300">
                  {previewWords}
                  {extraCount > 0 ? ` (+${extraCount} weitere)` : ""}
                </span>
              </div>

              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0 ${style.badgeClass}`}
              >
                {block.status === "analyzing" && <Loader2 className="w-3 h-3 animate-spin" />}
                {block.status === "queued" && <Clock className="w-3 h-3" />}
                {block.status === "done" && <CheckCircle2 className="w-3 h-3" />}
                {block.status === "background" && <Clock className="w-3 h-3" />}
                {style.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
