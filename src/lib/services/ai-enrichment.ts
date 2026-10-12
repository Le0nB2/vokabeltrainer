import { GoogleGenAI, Type } from "@google/genai";
import prisma from "@/lib/prisma";

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export async function enrichCards(cards: any[], apiKeys: string[]) {
  let lastError: unknown = null;
  let success = false;
  let enrichedCards = null;

  const models = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

  const promptText = `
Du bist ein didaktischer Englischlehrer für Schüler im Alter von 11 bis 13 Jahren (5.–7. Klasse). Generiere für die folgenden Vokabelpaare zwingend eine Eselsbrücke auf Deutsch ('mnemonic') nach der Schlüsselwortmethode: 1. Finde ein deutsches Wort, das lautmalerisch an das englische Wort erinnert. 2. Verknüpfe dieses Klangwort in einer kurzen, bildhaften Szene mit der deutschen Übersetzung. Keine reinen Reime ohne Klangbezug, keine Beleidigungen, strikt jugendfrei. Erstelle auch einen einfachen, verständlichen englischen Beispielsatz ('contextSentence'). Erstelle zwingend einen Lückentext ('gapText'), der EXAKT derselbe Satz wie 'contextSentence' ist, bei dem jedoch das englische Zielwort durch '___' ersetzt wurde.

Hier sind die Vokabeln:
${JSON.stringify(cards, null, 2)}
`;

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
                    description: "Exakt identisch mit contextSentence, wobei das englische Zielwort durch '___' ersetzt wurde.",
                  },
                  mnemonic: {
                    type: Type.STRING,
                    description: "Bildhafte Eselsbrücke nach der Schlüsselwortmethode (lautmalerisches deutsches Wort verknüpft mit der Übersetzung), jugendfrei.",
                  },
                  contextSentence: {
                    type: Type.STRING,
                    description: "Ein einfacher, für 11-13-Jährige verständlicher englischer Beispielsatz.",
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
        }).catch(err => console.error("DB Log Error:", err));

        break; // Success, exit inner model loop
      } catch (error: unknown) {
        // Log error
        await prisma.apiUsageLog.create({
          data: {
            apiKeyIndex: attemptIndex + 1,
            isSuccess: false,
            endpoint: "enrich-csv"
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
            throw new QuotaExceededError("Dein kostenloses Google API-Kontingente ist aufgebraucht. Versuche es in ein paar Stunden noch einmal");
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
    return enrichedCards;
  }

  // If we reach here without success and without returning the specific 429 error, throw the last error
  throw lastError;
}
