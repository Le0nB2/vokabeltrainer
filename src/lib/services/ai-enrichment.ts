import { Type } from "@google/genai";
import { callGeminiWithRetry, QuotaExceededError } from "@/lib/services/gemini-executor";

export { QuotaExceededError };

export async function enrichCards(cards: any[], apiKeys: string[]) {
  const promptText = `
Du bist ein didaktischer Englischlehrer für Schüler im Alter von 11 bis 13 Jahren (5.–7. Klasse). Generiere für die folgenden Vokabelpaare zwingend eine Eselsbrücke auf Deutsch ('mnemonic') nach der Schlüsselwortmethode: 1. Finde ein deutsches Wort, das lautmalerisch an das englische Wort erinnert. 2. Verknüpfe dieses Klangwort in einer kurzen, bildhaften Szene mit der deutschen Übersetzung. Keine reinen Reime ohne Klangbezug, keine Beleidigungen, strikt jugendfrei. Erstelle auch einen einfachen, verständlichen englischen Beispielsatz ('contextSentence'). Erstelle zwingend einen Lückentext ('gapText'), der EXAKT derselbe Satz wie 'contextSentence' ist, bei dem jedoch das englische Zielwort durch '___' ersetzt wurde.

Hier sind die Vokabeln:
${JSON.stringify(cards, null, 2)}
`;

  return callGeminiWithRetry({
    endpoint: "enrich-csv",
    apiKeys,
    execute: async (ai, model) => {
      const response = await ai.models.generateContent({
        model,
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

      let enrichedCards = JSON.parse(textResponse);

      // Cleanup step: if gapText only contains "___", set it to null
      if (Array.isArray(enrichedCards)) {
        enrichedCards = enrichedCards.map((card: any) => {
          if (card.gapText && card.gapText.trim() === "___") {
            return { ...card, gapText: null };
          }
          return card;
        });
      }

      return enrichedCards;
    },
  });
}
