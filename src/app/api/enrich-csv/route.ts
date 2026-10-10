import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import prisma from "@/lib/prisma";

let currentKeyIndex = 0;

export async function POST(req: NextRequest) {
  try {
    const { cards } = await req.json();

    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return NextResponse.json({ error: "No cards provided" }, { status: 400 });
    }

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
    let enrichedCards = null;

    const models = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

    const promptText = `
Generiere für die folgenden Vokabelpaare zwingend eine witzige/bildhafte, jugendfreie und für 11- bis 13-Jährige geeignete Eselsbrücke auf Deutsch ('mnemonic') sowie einen einfachen englischen Beispielsatz ('contextSentence'). Generiere zudem zwingend einen Lückentext ('gapText', englischer Beispielsatz, in dem das englische Wort fehlt - ersetze es durch ___).

Hier sind die Vokabeln:
${JSON.stringify(cards, null, 2)}
`;

    for (let i = 0; i < apiKeys.length; i++) {
      const attemptIndex = (currentKeyIndex + i) % apiKeys.length;
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
              responseJsonSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: {
                      type: Type.STRING,
                      description: "Die ID der Vokabel, exakt wie in der Eingabe",
                    },
                    gapText: {
                      type: Type.STRING,
                      description: "Ein englischer Beispielsatz in dem das Ausgangswort durch ___ ersetzt ist.",
                    },
                    mnemonic: {
                      type: Type.STRING,
                      description: "Eine witzige/bildhafte, jugendfreie und für 11- bis 13-Jährige geeignete Eselsbrücke auf Deutsch",
                    },
                    contextSentence: {
                      type: Type.STRING,
                      description: "Ein einfacher englischer Beispielsatz",
                    },
                  },
                  required: ["id", "mnemonic", "contextSentence", "gapText"],
                },
              },
            },
          });

          const textResponse = response.text;
          if (!textResponse) {
            throw new Error("Failed to generate text from Gemini");
          }

          enrichedCards = JSON.parse(textResponse);
          success = true;

          // Log success
          await prisma.apiUsageLog.create({
            data: {
              apiKeyIndex: attemptIndex + 1,
              isSuccess: true,
              endpoint: "enrich-csv"
            }
          });

          // Update the global index to the key that just succeeded
          currentKeyIndex = attemptIndex;
          break; // Success, exit inner model loop
        } catch (error: unknown) {
          // Log error
          await prisma.apiUsageLog.create({
            data: {
              apiKeyIndex: attemptIndex + 1,
              isSuccess: false,
              endpoint: "enrich-csv"
            }
          });

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

            if (i === apiKeys.length - 1 && modelIndex === models.length - 1) {
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

    if (success && enrichedCards) {
      return NextResponse.json({ cards: enrichedCards });
    }

    // If we reach here without success and without returning the specific 429 error, throw the last error
    throw lastError;

  } catch (error: unknown) {
    console.error("Enrich CSV error:", error);
    return NextResponse.json({ error: (error as Error).message || String(error) || "Internal server error" }, { status: 500 });
  }
}
