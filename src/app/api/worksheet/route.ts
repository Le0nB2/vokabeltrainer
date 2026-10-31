import { generateOptimizedPdf } from '@/lib/utils/pdf-helper';
import { NextRequest, NextResponse } from "next/server";
import { Type, Schema } from "@google/genai";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { requireAppAuth, UnauthorizedError } from "@/lib/auth-guard";
import { consumeRateLimit, formatRetryDuration, getClientIpFromHeaders } from "@/lib/rate-limit";
import { callGeminiWithRetry, QuotaExceededError, GeminiStatusEvent } from "@/lib/services/gemini-executor";
import { formatSseEvent } from "@/lib/services/ai-status";

const requestSchema = z.object({
  deckId: z.string().min(1, "No deckId provided").max(100, "deckId darf maximal 100 Zeichen lang sein"),
  stream: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    try {
      await requireAppAuth();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Nicht autorisiert. Bitte melde dich an." }, { status: 401 });
      }
      throw error;
    }

    const clientIp = getClientIpFromHeaders(req.headers);
    const limit = consumeRateLimit(`worksheet:${clientIp}`, {
      maxAttempts: 3,
      windowMs: 60 * 1000,
      blockDurationMs: 60 * 1000,
    });

    if (limit.isBlocked) {
      return NextResponse.json(
        {
          error: `Zu viele Anfragen zur Arbeitsblatt-Erstellung. Bitte warte ${formatRetryDuration(limit.retryAfterSeconds)}.`,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parseResult = requestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { deckId, stream: isStreamingRequested } = parseResult.data;

    const deck = await prisma.deck.findUnique({
      where: { id: deckId },
      include: {
        cards: true,
      },
    });

    if (!deck) {
      return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    }

    if (deck.cards.length < 5) {
       return NextResponse.json({ error: "Deck needs at least 5 cards for a worksheet" }, { status: 400 });
    }

    // Select up to 20 cards (prioritizing due cards, then filling up randomly)
    const now = new Date();
    const dueCards = deck.cards.filter(c => c.dueDate <= now);
    const notDueCards = deck.cards.filter(c => c.dueDate > now);

    // Shuffle both arrays
    dueCards.sort(() => 0.5 - Math.random());
    notDueCards.sort(() => 0.5 - Math.random());

    const selectedCards = [...dueCards, ...notDueCards].slice(0, 60);

    const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY;
    if (!rawKeys) {
      return NextResponse.json({ error: "GEMINI_API_KEYS is not configured" }, { status: 500 });
    }
    const apiKeys = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);

    if (apiKeys.length === 0) {
      return NextResponse.json({ error: "No valid API keys found" }, { status: 500 });
    }


    const promptText = `
Erstelle ein Arbeitsblatt für die Klassenstufe 5-7 basierend auf den folgenden Vokabeln. Das Fach ist Englisch.
Die Zielsprache der Vokabeln ist Englisch (front = Englisch, back = Deutsch). Generiere sehr viele Aufgaben nach dem geforderten JSON Schema, sodass diese gedruckt ca. 4 DIN-A4-Seiten füllen.
Generiere exakt 18 Multiple-Choice-Aufgaben, exakt 16 Words in a Box-Aufgaben (mit 16 Wörtern in der Word Box und 16 Lückensätzen), exakt 26 Übersetzungsaufgaben und exakt 24 Lückentexte.
WICHTIG:
1. Mische die Reihenfolge der Wörter in der Word Box zufällig durch!
2. Die Lückensätze für 'Words in a box' müssen sprachlich für die Klassenstufe 5-7 (Englisch) geeignet sein. Sie müssen so formuliert sein, dass jede Vokabel aus der Box absolut eindeutig nur in genau EINEN bestimmten Satz inhaltlich und grammatikalisch passt (keine Mehrdeutigkeiten)!
3. Die Optionen der Multiple-Choice-Aufgaben, die deutschen Sätze für 'Translation challenge' sowie die englischen Sätze für 'Fill in the blanks' und 'Words in a box' müssen für Klassenstufe 5-7 angemessen kurz und prägnant sein (ca. 4 bis 7 Wörter pro Satz), damit sie gut auf die Zeilen passen und das Arbeitsblatt optimal füllen.

Hier sind die Vokabeln:
${JSON.stringify(selectedCards.map(c => ({ englisch: c.front, deutsch: c.back })), null, 2)}
`;

    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        exercises: {
          type: Type.OBJECT,
          properties: {
            multipleChoice: {
              type: Type.ARRAY,
              description: "Exakt 18 Aufgaben. 'Welcher Satz ist grammatikalisch und inhaltlich richtig?'",
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Exactly 3 options [A, B, C]"
                  },
                  correctIndex: { type: Type.INTEGER, description: "Index of correct option (0, 1, or 2)" }
                },
                required: ["question", "options", "correctIndex"]
              }
            },
            fillInTheBlank: {
              type: Type.ARRAY,
              description: "Exakt 24 Lückentexte mit Zeile für Handschrift und deutschem Übersetzungshinweis.",
              items: {
                type: Type.OBJECT,
                properties: {
                  sentenceBeforeGap: { type: Type.STRING },
                  sentenceAfterGap: { type: Type.STRING },
                  germanHint: { type: Type.STRING },
                  answer: { type: Type.STRING }
                },
                required: ["sentenceBeforeGap", "sentenceAfterGap", "germanHint", "answer"]
              }
            },
            wordBoxWords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Exakt 16 Wörter für die Wortbox."
            },
            wordBoxSentences: {
              type: Type.ARRAY,
              description: "Exakt 16 Lückensätze, deren Begriffe gesammelt in einer Wortbox (wordBoxWords) oben stehen.",
              items: {
                type: Type.OBJECT,
                properties: {
                  sentenceBeforeGap: { type: Type.STRING },
                  sentenceAfterGap: { type: Type.STRING },
                  answer: { type: Type.STRING }
                },
                required: ["sentenceBeforeGap", "sentenceAfterGap", "answer"]
              }
            },
            translateSentences: {
              type: Type.ARRAY,
              description: "Exakt 26 kurze deutsche Sätze mit vorgegebenem Anfangsbuchstaben für das englische Wort.",
              items: {
                type: Type.OBJECT,
                properties: {
                  germanSentence: { type: Type.STRING },
                  englishFirstLetter: { type: Type.STRING },
                  answer: { type: Type.STRING }
                },
                required: ["germanSentence", "englishFirstLetter", "answer"]
              }
            }
          },
          required: ["multipleChoice", "fillInTheBlank", "wordBoxWords", "wordBoxSentences", "translateSentences"]
        },
        solutions: {
          type: Type.OBJECT,
          properties: {
            fillInTheBlankSolutions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Lösungen für Lückentexte" },
            wordBoxSolutions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Lösungen für Words in a box" },
            translateSolutions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Lösungen für Translation challenge" }
          },
          required: ["fillInTheBlankSolutions", "wordBoxSolutions", "translateSolutions"]
        }
      },
      required: ["exercises", "solutions"]
    };

    const generateWorksheetData = async (
      onGeminiStatus?: (event: GeminiStatusEvent) => void | Promise<void>,
      onProgress?: (message: string) => void
    ) => {
      const parsedWorksheet = await callGeminiWithRetry({
        endpoint: "worksheet",
        apiKeys,
        onStatus: onGeminiStatus,
        execute: async (ai, modelToUse) => {
          const response = await ai.models.generateContent({
            model: modelToUse,
            contents: [promptText],
            config: {
              responseMimeType: "application/json",
              responseJsonSchema: responseSchema,
              temperature: 0.2, // low temp for structured task
            },
          });

          const textResponse = response.text;
          if (!textResponse) {
            throw new Error("Failed to generate text from Gemini");
          }

          const data = JSON.parse(textResponse);

          // Shuffle multiple choice options manually to ensure uniform distribution
          if (data?.exercises?.multipleChoice && Array.isArray(data.exercises.multipleChoice)) {
            data.exercises.multipleChoice = data.exercises.multipleChoice.map((mc: { options?: string[], correctIndex?: number }) => {
              if (mc.options && Array.isArray(mc.options) && typeof mc.correctIndex === 'number') {
                const correctAnswer = mc.options[mc.correctIndex];

                // Fisher-Yates shuffle
                for (let j = mc.options.length - 1; j > 0; j--) {
                  const k = Math.floor(Math.random() * (j + 1));
                  [mc.options[j], mc.options[k]] = [mc.options[k], mc.options[j]];
                }

                // Find new correct index
                mc.correctIndex = mc.options.indexOf(correctAnswer);
              }
              return mc;
            });
          }

          return data;
        },
      });

      onProgress?.("Aufgaben generiert! Optimiere Layout für maximal 4 Druckseiten...");

      const settings = await prisma.settings.upsert({
        where: { id: "default" },
        update: { worksheetCount: { increment: 1 } },
        create: { id: "default", worksheetCount: 1 }
      });

      // Compute alphabetical ID (A001 to Z999)
      const count = settings.worksheetCount;
      const letterIndex = Math.floor((count - 1) / 999);
      const letter = String.fromCharCode(65 + (letterIndex % 26)); // A-Z, wraps around
      const number = ((count - 1) % 999) + 1;
      const worksheetId = `${letter}${number.toString().padStart(3, '0')}`;

      // Generate date string in German format
      const today = new Date();
      const dateStr = `${today.getDate().toString().padStart(2, '0')}.${(today.getMonth() + 1).toString().padStart(2, '0')}.${today.getFullYear()}`;

      // Optimiere Worksheet, sodass es nicht mehr als 4 Seiten lang ist
      const optimized = await generateOptimizedPdf(
        worksheetId,
        dateStr,
        parsedWorksheet.exercises,
        parsedWorksheet.solutions,
        4,
        deck.title
      );

      parsedWorksheet.exercises = optimized.finalExercises;
      parsedWorksheet.solutions = optimized.finalSolutions;

      return {
        worksheet: parsedWorksheet,
        worksheetId,
        dateStr,
        deckName: deck.title,
      };
    };

    const isStream = isStreamingRequested || req.headers.get("accept")?.includes("text/event-stream");

    if (isStream) {
      let isClosed = false;
      const stream = new ReadableStream({
        async start(controller) {
          const safeEnqueue = (eventBytes: Uint8Array) => {
            if (isClosed) return false;
            try {
              controller.enqueue(eventBytes);
              return true;
            } catch {
              isClosed = true;
              return false;
            }
          };

          const safeClose = () => {
            if (isClosed) return;
            isClosed = true;
            try {
              controller.close();
            } catch {
              // Ignore if already closed
            }
          };

          // Keep-alive heartbeat: sends a ping every 3s so Safari/mobile proxies don't drop the stream
          const heartbeat = setInterval(() => {
            safeEnqueue(
              formatSseEvent("ping", {
                stage: "generating",
                timestamp: Date.now(),
              })
            );
          }, 3000);

          try {
            safeEnqueue(
              formatSseEvent("status", {
                stage: "init",
                message: `Vokabeln geladen (${selectedCards.length} Vokabeln). Starte KI-Generierung...`,
                timestamp: Date.now(),
              })
            );

            const result = await generateWorksheetData(
              async (statusEvent) => {
                const stage =
                  statusEvent.type === "retry"
                    ? "retrying"
                    : statusEvent.type === "fallback"
                    ? "fallback"
                    : statusEvent.type === "key_switch"
                    ? "key_switch"
                    : "generating";

                safeEnqueue(
                  formatSseEvent("status", {
                    stage,
                    message: statusEvent.message,
                    model: statusEvent.model,
                    attempt: statusEvent.attempt,
                    maxAttempts: statusEvent.maxAttempts,
                    delaySeconds: statusEvent.delaySeconds,
                    timestamp: Date.now(),
                  })
                );
              },
              (optimizingMsg) => {
                safeEnqueue(
                  formatSseEvent("status", {
                    stage: "optimizing",
                    message: optimizingMsg,
                    timestamp: Date.now(),
                  })
                );
              }
            );

            safeEnqueue(
              formatSseEvent("complete", {
                stage: "complete",
                message: "Arbeitsblatt erfolgreich generiert!",
                data: result,
                timestamp: Date.now(),
              })
            );
          } catch (err: unknown) {
            console.error("Worksheet streaming error:", err);
            const errorMsg =
              err instanceof QuotaExceededError
                ? err.message
                : "Fehler beim Erstellen des Arbeitsblatts. Bitte versuche es erneut.";

            safeEnqueue(
              formatSseEvent("error", {
                stage: "error",
                error: errorMsg,
                timestamp: Date.now(),
              })
            );
          } finally {
            clearInterval(heartbeat);
            safeClose();
          }
        },
        cancel() {
          isClosed = true;
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const result = await generateWorksheetData();
    return NextResponse.json(result);

  } catch (error: unknown) {
    if (error instanceof QuotaExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error("Worksheet error:", error);
    return NextResponse.json({ error: "Fehler beim Erstellen des Arbeitsblatts. Bitte versuche es erneut." }, { status: 500 });
  }
}
