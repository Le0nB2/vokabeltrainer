import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import prisma from "@/lib/prisma";


let currentKeyIndex = 0;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File;

    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Read multiple keys or fallback to single key
    const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY;
    if (!rawKeys) {
      return NextResponse.json({ error: "GEMINI_API_KEYS is not configured" }, { status: 500 });
    }
    const apiKeys = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);

    if (apiKeys.length === 0) {
      return NextResponse.json({ error: "No valid API keys found" }, { status: 500 });
    }

    // Convert File to base64
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString("base64");
    const mimeType = file.type;

    let lastError: unknown = null;
    let success = false;
    let parsedCards = null;

    const models = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

    // Try keys starting from the currentKeyIndex
    for (let i = 0; i < apiKeys.length; i++) {
      const attemptIndex = (currentKeyIndex + i) % apiKeys.length;
      const apiKey = apiKeys[attemptIndex];
      const ai = new GoogleGenAI({ apiKey });

      for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
        const modelToUse = models[modelIndex];

        try {
          const response = await ai.models.generateContent({
            model: modelToUse,
            contents: [
              "Extrahiere alle Vokabelpaare aus diesem Foto (Buchseite, Liste, Notizbuch). Trenne Ausgangswort und Übersetzung/Bedeutung exakt. Korrigiere offensichtliche Lesefehler. Generiere zudem für jede Vokabel zwingend eine witzige/bildhafte, jugendfreie und für 11- bis 13-Jährige geeignete Eselsbrücke auf Deutsch ('mnemonic') sowie einen einfachen englischen Beispielsatz ('contextSentence'). Generiere zudem zwingend einen Lückentext ('gapText', englischer Beispielsatz, in dem das englische Wort fehlt). Behalte 'notes' für grammatikalische Hinweise bei. Ignoriere Seitenzahlen und Überschriften.",
              { inlineData: { data: base64Image, mimeType: mimeType } }
            ],
            config: {
              responseMimeType: "application/json",
              responseJsonSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    front: {
                      type: Type.STRING,
                      description: "Das Ausgangswort oder die Frage",
                    },
                    back: {
                      type: Type.STRING,
                      description: "Die Übersetzung oder die Antwort",
                    },
                    notes: {
                      type: Type.STRING,
                      description: "Optionale Beispielsätze oder grammatikalische Notizen",
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
                  required: ["front", "back", "mnemonic", "contextSentence", "gapText"],
                },
              },
            },
          });

          const textResponse = response.text;
          if (!textResponse) {
            throw new Error("Failed to generate text from Gemini");
          }

          parsedCards = JSON.parse(textResponse);
          success = true;

          // Log success
          await prisma.apiUsageLog.create({
            data: {
              apiKeyIndex: attemptIndex + 1,
              isSuccess: true,
              endpoint: "scan-image"
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
              endpoint: "scan-image"
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

    if (success && parsedCards) {
      return NextResponse.json({ cards: parsedCards });
    }

    // If we reach here without success and without returning the specific 429 error, throw the last error
    throw lastError;

  } catch (error: unknown) {
    console.error("Scan error:", error);
    return NextResponse.json({ error: (error as Error).message || String(error) || "Internal server error" }, { status: 500 });
  }
}
