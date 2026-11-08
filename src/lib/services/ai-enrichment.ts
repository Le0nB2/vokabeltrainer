import { QuotaExceededError } from "@/lib/services/gemini-executor";
import { getActiveAiProvider } from "@/lib/ai/ai-router";
import { GeminiProvider } from "@/lib/ai/providers/gemini-provider";

export { QuotaExceededError };

export async function enrichCards(cards: any[], apiKeys?: string[], userId?: string) {
  const promptText = `
Du bist ein didaktischer Englischlehrer für Schüler im Alter von 11 bis 13 Jahren (5.–7. Klasse). Generiere für die folgenden Vokabelpaare zwingend eine Eselsbrücke auf Deutsch ('mnemonic') nach der Schlüsselwortmethode: 1. Finde ein deutsches Wort, das lautmalerisch an das englische Wort erinnert. 2. Verknüpfe dieses Klangwort in einer kurzen, bildhaften Szene mit der deutschen Übersetzung. Keine reinen Reime ohne Klangbezug, keine Beleidigungen, strikt jugendfrei. Erstelle auch einen einfachen, verständlichen englischen Beispielsatz ('contextSentence'). Erstelle zwingend einen Lückentext ('gapText'), der EXAKT derselbe Satz wie 'contextSentence' ist, bei dem jedoch das englische Zielwort durch '___' ersetzt wurde.

Hier sind die Vokabeln:
${JSON.stringify(cards, null, 2)}

Antworte ausschließlich im JSON-Format als Liste von Objekten mit den Feldern: id, mnemonic, contextSentence, gapText.
`;

  let enrichedCards: any

  if (apiKeys && apiKeys.length > 0) {
    const provider = new GeminiProvider(apiKeys);
    enrichedCards = await provider.generateStructuredJson({ prompt: promptText });
  } else {
    const { provider } = await getActiveAiProvider(userId);
    enrichedCards = await provider.generateStructuredJson({ prompt: promptText });
  }

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
}
