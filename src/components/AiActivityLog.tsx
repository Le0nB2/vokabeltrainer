"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { AiStatusMessage } from "@/lib/services/ai-status";

interface AiActivityLogProps {
  history: AiStatusMessage[];
  defaultOpen?: boolean;
  className?: string;
  title?: string;
}

export function AiActivityLog({
  history,
  defaultOpen = false,
  className = "",
  title,
}: AiActivityLogProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (!history || history.length === 0) {
    return null;
  }

  const label = title || `Aktivitäten (${history.length})`;

  return (
    <div className={`w-full text-left ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors py-1 cursor-pointer"
        aria-expanded={isOpen}
      >
        <span>{label}</span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="mt-2.5 max-h-48 overflow-y-auto space-y-1.5 text-[11px] font-mono bg-zinc-50 dark:bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
          {history.map((item, index) => {
            const date = new Date(item.timestamp);
            const timeStr = !isNaN(date.getTime())
              ? date.toTimeString().split(" ")[0]
              : "--:--:--";
            return (
              <div
                key={index}
                className="flex items-start gap-2 text-zinc-600 dark:text-zinc-400"
              >
                <span className="text-zinc-400 shrink-0">[{timeStr}]</span>
                <span className="break-all">{item.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
