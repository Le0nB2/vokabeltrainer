import { generateOptimizedPdf } from '@/lib/utils/pdf-helper';
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type, Schema } from "@google/genai";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { deckId } = await req.json();

    if (!deckId) {
      return NextResponse.json({ error: "No deckId provided" }, { status: 400 });
    }

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

    let lastError: unknown = null;
    let success = false;
    let parsedWorksheet = null;

    const models = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

    const promptText = `
Erstelle ein Arbeitsblatt für die Klassenstufe 5-7 basierend auf den folgenden Vokabeln. Das Fach ist Englisch.
Die Zielsprache der Vokabeln ist Englisch (front = Englisch, back = Deutsch). Generiere sehr viele Aufgaben nach dem geforderten JSON Schema, sodass diese gedruckt ca. 4 DIN-A4-Seiten füllen.
Generiere exakt 12 Multiple-Choice-Aufgaben, exakt 12 Lückentexte, 10-15 Words in a Box-Aufgaben und exakt 26 Übersetzungsaufgaben.
WICHTIG:
1. Mische die Reihenfolge der Wörter in der Word Box zufällig durch!
2. Die Lückensätze für 'Words in a box' müssen sprachlich für die Klassenstufe 5-7 (Englisch) geeignet sein. Sie müssen so formuliert sein, dass jede Vokabel aus der Box absolut eindeutig nur in genau EINEN bestimmten Satz inhaltlich und grammatikalisch passt (keine Mehrdeutigkeiten)!

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
              description: "Exakt 12 Aufgaben. 'Welcher Satz ist grammatikalisch und inhaltlich richtig?'",
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
              description: "Exakt 12 Lückentexte mit Zeile für Handschrift und deutschem Übersetzungshinweis.",
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
              description: "List of words that go into the word box for wordBoxSentences"
            },
            wordBoxSentences: {
              type: Type.ARRAY,
              description: "10-15 Lückensätze, deren Begriffe gesammelt in einer Wortbox (wordBoxWords) oben stehen.",
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

    for (let attemptIndex = 0; attemptIndex < apiKeys.length; attemptIndex++) {

      const apiKey = apiKeys[attemptIndex];
      const ai = new GoogleGenAI({ apiKey });

      for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
        const modelToUse = models[modelIndex];

        try {
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

          parsedWorksheet = JSON.parse(textResponse);

          // Shuffle multiple choice options manually to ensure uniform distribution
          if (parsedWorksheet?.exercises?.multipleChoice && Array.isArray(parsedWorksheet.exercises.multipleChoice)) {
            parsedWorksheet.exercises.multipleChoice = parsedWorksheet.exercises.multipleChoice.map((mc: { options?: string[], correctIndex?: number }) => {
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

          success = true;

          // Log success
          await prisma.apiUsageLog.create({
            data: {
              apiKeyIndex: attemptIndex + 1,
              isSuccess: true,
              endpoint: "worksheet"
            }
          }).catch(err => console.error("DB Log Error:", err));


          break; // Success, exit inner model loop
        } catch (error: unknown) {
          // Log error
          await prisma.apiUsageLog.create({
            data: {
              apiKeyIndex: attemptIndex + 1,
              isSuccess: false,
              endpoint: "worksheet"
            }
          }).catch(err => console.error("DB Log Error:", err));

          lastError = error;
          const errorMessage = (error as Error).message || String(error);

          // Check if it's a 503 error, try next model
          if (errorMessage.includes("503") || errorMessage.includes("Service Unavailable")) {
            console.warn(`Model ${modelToUse} failed with 503 on key index ${attemptIndex}. Trying next model if available.`);
            continue;
          }

          // Check if it's a quota/429 error, break inner loop to try next key
          if (errorMessage.includes("429") || errorMessage.includes("Quota exceeded") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
            console.warn(`API key at index ${attemptIndex} exhausted quota. Trying next key if available.`);

            if (attemptIndex === apiKeys.length - 1 && modelIndex === models.length - 1) {
              return NextResponse.json(
                { error: "Dein kostenloses Google API-Kontingente ist aufgebraucht. Versuche es in ein paar Stunden noch einmal" },
                { status: 429 }
              );
            }
            break; // Break inner model loop, let outer key loop continue
          } else {
            console.error(`Non-quota error with key index ${attemptIndex} and model ${modelToUse}:`, error);
            if (modelIndex === models.length - 1) {
              throw error; // Only throw if all models failed with this unexpected error
            }
          }
        }
      }

      if (success) {
        break; // Success, exit outer key loop
      }
    }

    const settings = await prisma.settings.upsert({
      where: { id: "default" },
      update: { worksheetCount: { increment: 1 } },
      create: { id: "default", worksheetCount: 1 }
    });

    // Compute alphabetical ID (A001 to Z999)
    const count = settings.worksheetCount;
    // A001 starts at count 1.
    // So for count 1: letter A, number 1
    // For count 999: letter A, number 999
    // For count 1000: letter B, number 1
    const letterIndex = Math.floor((count - 1) / 999);
    const letter = String.fromCharCode(65 + (letterIndex % 26)); // A-Z, wraps around
    const number = ((count - 1) % 999) + 1;
    const worksheetId = `${letter}${number.toString().padStart(3, '0')}`;

    // Generate date string in German format
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, '0')}.${(today.getMonth() + 1).toString().padStart(2, '0')}.${today.getFullYear()}`;

    if (success && parsedWorksheet) {
      // Optimiere Worksheet, sodass es nicht mehr als 4 Seiten lang ist
      const optimized = await generateOptimizedPdf(
        worksheetId,
        dateStr,
        parsedWorksheet.exercises,
        parsedWorksheet.solutions,
        4
      );

      parsedWorksheet.exercises = optimized.finalExercises;
      parsedWorksheet.solutions = optimized.finalSolutions;

      return NextResponse.json({
        worksheet: parsedWorksheet,
        worksheetId,
        dateStr
      });

    }

    throw lastError;

  } catch (error: unknown) {
    console.error("Worksheet error:", error);
    return NextResponse.json({ error: (error as Error).message || String(error) || "Internal server error" }, { status: 500 });
  }
}
