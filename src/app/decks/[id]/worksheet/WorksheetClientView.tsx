"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { usePDF, Document, Page } from "@react-pdf/renderer";
import WorksheetPDF from "./WorksheetPDF";
import { AiProgressCard } from "@/components/AiProgressCard";
import { AiActivityLog } from "@/components/AiActivityLog";
import { readAiStatusStream, AiStatusMessage } from "@/lib/services/ai-status";

interface WorksheetData {
  multipleChoice: {
    question: string;
    options: string[];
    correctIndex: number;
  }[];
  fillInTheBlank: {
    sentenceBeforeGap: string;
    sentenceAfterGap: string;
    germanHint: string;
    answer: string;
  }[];
  wordBoxWords: string[];
  wordBoxSentences: {
    sentenceBeforeGap: string;
    sentenceAfterGap: string;
    answer: string;
  }[];
  translateSentences: {
    germanSentence: string;
    englishFirstLetter: string;
    answer: string;
  }[];
}

interface SolutionData {
  fillInTheBlankSolutions: string[];
  wordBoxSolutions: string[];
  translateSolutions: string[];
}

interface WorksheetResponse {
  exercises: WorksheetData;
  solutions: SolutionData;
  worksheetId: string;
  dateStr: string;
  deckName?: string;
}

interface ApiWorksheetPayload {
  worksheet: {
    exercises: WorksheetData;
    solutions: SolutionData;
  };
  worksheetId: string;
  dateStr: string;
  deckName?: string;
}

export default function WorksheetClientView({
  deckId,
  initialDeckName,
}: {
  deckId: string;
  initialDeckName?: string;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [worksheetData, setWorksheetData] = useState<WorksheetResponse | null>(null);
  const [currentStatus, setCurrentStatus] = useState<AiStatusMessage | null>(null);
  const [statusHistory, setStatusHistory] = useState<AiStatusMessage[]>([]);

  const [pdfInstance, updatePdf] = usePDF({
    document: worksheetData ? (
      <WorksheetPDF
        exercises={worksheetData.exercises}
        solutions={worksheetData.solutions}
        worksheetId={worksheetData.worksheetId}
        dateStr={worksheetData.dateStr}
        deckName={worksheetData.deckName}
      />
    ) : (
      <Document>
        <Page></Page>
      </Document>
    ),
  });

  useEffect(() => {
    if (worksheetData) {
      updatePdf(
        <WorksheetPDF
          exercises={worksheetData.exercises}
          solutions={worksheetData.solutions}
          worksheetId={worksheetData.worksheetId}
          dateStr={worksheetData.dateStr}
          deckName={worksheetData.deckName}
        />
      );
    }
  }, [worksheetData, updatePdf]);

  useEffect(() => {
    async function fetchWorksheet() {
      try {
        const res = await fetch("/api/worksheet", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({ deckId, stream: true }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `Fehler beim Generieren (${res.status})`);
        }

        const data = await readAiStatusStream<ApiWorksheetPayload>(res, (statusUpdate) => {
          setCurrentStatus(statusUpdate);
          setStatusHistory((prev) => [...prev, statusUpdate]);
        });

        setWorksheetData({
          exercises: data.worksheet.exercises,
          solutions: data.worksheet.solutions,
          worksheetId: data.worksheetId,
          dateStr: data.dateStr,
          deckName: data.deckName || initialDeckName,
        });
      } catch (err: unknown) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    if (deckId) {
      fetchWorksheet();
    }
  }, [deckId, initialDeckName]);

  const getPdfFileName = () => {
    if (!worksheetData) return "Worksheet.pdf";
    const baseId = worksheetData.worksheetId || "Worksheet";
    if (worksheetData.deckName) {
      const safeDeckName = worksheetData.deckName.replace(/[/\\?%*:|"<>]/g, "-").trim();
      return `${safeDeckName} - ${baseId}.pdf`;
    }
    return `${baseId}.pdf`;
  };

  const handlePrint = () => {
    if (!worksheetData || !pdfInstance.url) return;
    try {
      const fileName = getPdfFileName();
      const oldTitle = document.title;
      document.title = fileName;
      const newWindow = window.open(pdfInstance.url, "_blank");

      if (!newWindow) {
        const a = document.createElement("a");
        a.href = pdfInstance.url;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      setTimeout(() => {
        document.title = oldTitle;
      }, 2000);
    } catch (err) {
      console.error("Print error:", err);
      alert(
        "Es gab ein Problem beim Drucken des PDFs.\nFehler: " +
          (err instanceof Error ? err.message : String(err))
      );
    }
  };

  const handleDownload = () => {
    if (!worksheetData || !pdfInstance.url) return;
    try {
      const fileName = getPdfFileName();

      const a = document.createElement("a");
      a.href = pdfInstance.url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Download error:", err);
      alert(
        "Es gab ein Problem beim Herunterladen des PDFs.\nFehler: " +
          (err instanceof Error ? err.message : String(err))
      );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-zinc-50/50 dark:bg-zinc-950/50">
        <AiProgressCard
          title="Arbeitsblatt wird erstellt"
          currentStatus={currentStatus}
          statusHistory={statusHistory}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="bg-red-50 text-red-600 p-6 rounded-xl max-w-md w-full">
          <h2 className="text-xl font-bold mb-2">Fehler aufgetreten</h2>
          <p className="mb-6">{error}</p>
          <button
            onClick={() => router.push(`/decks/${deckId}`)}
            className="flex items-center gap-2 justify-center w-full px-4 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Zurück zum Deck
          </button>
        </div>
      </div>
    );
  }

  if (!worksheetData) return null;

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 p-8 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          Arbeitsblatt ist fertig!
        </h2>
        <p className="text-zinc-600 dark:text-zinc-400 mb-8">
          Dein PDF-Arbeitsblatt mit Lösungen wurde erfolgreich generiert und ist bereit zum Drucken.
        </p>

        <div className="space-y-4">
          <button
            onClick={handlePrint}
            disabled={pdfInstance.loading || !pdfInstance.url}
            className={`w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-medium transition-colors shadow-sm ${
              pdfInstance.loading || !pdfInstance.url
                ? "bg-blue-400 cursor-not-allowed text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            <Printer className="w-5 h-5" />
            PDF direkt drucken
          </button>

          <button
            onClick={handleDownload}
            disabled={pdfInstance.loading || !pdfInstance.url}
            className={`w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-medium transition-colors ${
              pdfInstance.loading || !pdfInstance.url
                ? "bg-zinc-50 dark:bg-zinc-800/40 cursor-not-allowed text-zinc-400"
                : "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
            }`}
          >
            <Download className="w-5 h-5" />
            PDF herunterladen
          </button>

          <div className="pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              onClick={() => router.push(`/decks/${deckId}`)}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl font-medium transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Zurück zum Deck
            </button>
          </div>
        </div>

        {statusHistory.length > 0 && (
          <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <AiActivityLog history={statusHistory} />
          </div>
        )}
      </div>
    </div>
  );
}
