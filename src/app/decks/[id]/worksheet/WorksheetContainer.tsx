"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const WorksheetClientView = dynamic(() => import("./WorksheetClientView"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-zinc-50/50 dark:bg-zinc-950/50">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">PDF-Modul wird vorbereitet...</p>
      </div>
    </div>
  ),
});

export default function WorksheetContainer({
  deckId,
  initialDeckName,
}: {
  deckId: string;
  initialDeckName?: string;
}) {
  return <WorksheetClientView deckId={deckId} initialDeckName={initialDeckName} />;
}
