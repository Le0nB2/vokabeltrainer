import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import prisma from "@/lib/prisma";


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
    for (let attemptIndex = 0; attemptIndex < apiKeys.length; attemptIndex++) {

      const apiKey = apiKeys[attemptIndex];
      const ai = new GoogleGenAI({ apiKey });

      for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
        const modelToUse = models[modelIndex];

        try {
          const response = await ai.models.generateContent({
            model: modelToUse,
            contents: [
              `Du bist ein didaktischer Englischlehrer für Schüler im Alter von 11 bis 13 Jahren (5.–7. Klasse). Extrahiere alle Vokabelpaare aus diesem Foto (Buchseite, Liste, Notizbuch).

WICHTIGE REGELN:
1. Trenne das englische Ausgangswort ('front') und die deutsche Übersetzung/Bedeutung ('back') exakt. Korrigiere offensichtliche Lesefehler.
2. Exakte Buch-Bedeutung priorisieren: Wenn das Buch für ein Wort eine spezifische Bedeutung angibt (z.B. "year" = "der Jahrgang / die Jahrgangsstufe"), muss genau diese Bedeutung für 'back' und für den Beispielsatz 'contextSentence' verwendet werden.
3. Saubere Übernahme von Alternativen: Trennungen mit Schrägstrich aus dem Buch (z.B. "Du bist dran / an der Reihe" oder "das Sandwich, (zusammengeklapptes) belegtes Brot") sollen im Feld 'back' vollständig erhalten bleiben und nicht abgeschnitten werden.
4. Lautschrift: Falls auf dem Bild Lautschrift vorhanden ist, extrahiere sie in eckigen Klammern (z.B. [bɔːl]) in das Feld 'phonetic', sonst leer.
5. Hinweise & Grammatik: Lese die Zusatzspalte rechts konsequent aus und schreibe sie in das Feld 'notes' (z.B. Gegenteile "new ◄► old", Fragen "How old are you, please?", Aussprache-Tipps, Signalwörter, grammatikalische Besonderheiten).
6. Eselsbrücken ('mnemonic') nach der Schlüsselwortmethode:
   - Finde ein DEUTSCHES Wort, das lautmalerisch an das englische Wort erinnert (Klangwort).
   - KEINE Fantasiewörter! Das deutsche Klangwort MUSS ein echtes, existierendes deutsches Wort aus dem Duden sein.
   - Falls kein direktes deutsches Klangwort existiert, wähle ein Teilwort oder eine treffende lautmalerische Assoziation (z.B. "please" -> "Prise", "wrong" -> "Gong").
   - Verknüpfe dieses Klangwort in einer kurzen, bildhaften Szene mit der deutschen Übersetzung. Keine reinen Reime ohne Klangbezug, keine Beleidigungen, strikt jugendfrei.
7. Erstelle einen einfachen englischen Beispielsatz ('contextSentence').
8. Erstelle zwingend einen Lückentext ('gapText'), der EXAKT derselbe Satz wie 'contextSentence' ist, bei dem jedoch das Zielwort aus 'front' durch '___' ersetzt wurde.
9. Ignoriere Seitenzahlen und Überschriften.`,
              { inlineData: { data: base64Image, mimeType: mimeType } }
            ],
            config: {
              responseMimeType: "application/json",
              responseJsonSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    phonetic: {
                      type: Type.STRING,
                      description: "Die Lautschrift in eckigen Klammern, wie auf dem Bild angegeben, z. B. [bɔːl]. Sonst leer.",
                    },
                    front: {
                      type: Type.STRING,
                      description: "Das englische Ausgangswort",
                    },
                    back: {
                      type: Type.STRING,
                      description: "Die deutsche Übersetzung oder Bedeutung. Spezifische Bedeutungen aus dem Buch priorisieren. Alternativen mit Schrägstrich oder Klammern vollständig erhalten.",
                    },
                    notes: {
                      type: Type.STRING,
                      description: "Zusatzinfos aus der dritten Spalte rechts, z.B. Gegenteile ('new ◄► old'), typische Beispielsätze/Fragen ('How old are you, please?'), Aussprache-Tipps, Signalwörter oder grammatikalische Besonderheiten. Lese diese Spalte konsequent aus. Sonst leer.",
                    },
                    gapText: {
                      type: Type.STRING,
                      description: "Exakt identisch mit contextSentence, wobei das Wort aus 'front' durch '___' ersetzt wurde.",
                    },
                    mnemonic: {
                      type: Type.STRING,
                      description: "Bildhafte Eselsbrücke nach der Schlüsselwortmethode. Das deutsche Klangwort muss ein echtes, existierendes deutsches Wort aus dem Duden sein (oder eine treffende lautmalerische Assoziation/Teilwort, falls nicht vorhanden). Z.B. 'please' -> 'Prise', 'wrong' -> 'Gong'. Verknüpft mit der Übersetzung, jugendfrei.",
                    },
                    contextSentence: {
                      type: Type.STRING,
                      description: "Ein einfacher, für 11-13-Jährige verständlicher englischer Beispielsatz.",
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
          }).catch(err => console.error("DB Log Error:", err));


          break; // Success, exit inner model loop
        } catch (error: unknown) {
          // Log error
          await prisma.apiUsageLog.create({
            data: {
              apiKeyIndex: attemptIndex + 1,
              isSuccess: false,
              endpoint: "scan-image"
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
