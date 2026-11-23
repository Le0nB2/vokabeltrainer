import { QuotaExceededError } from "@/lib/services/gemini-executor";
import { getActiveAiProvider } from "@/lib/ai/ai-router";
import { GeminiProvider } from "@/lib/ai/providers/gemini-provider";

export { QuotaExceededError };

export async function enrichCards(cards: any[], apiKeys?: string[], userId?: string) {
  const promptText = `
Du bist ein erfahrener Englischlehrer und Gedächtnistrainer für Schüler der 5.–7. Klasse (11–13 Jahre).
Generiere für jede Vokabel zwingend eine didaktische Eselsbrücke nach der Schlüsselwortmethode (Keyword Method).

REGELN FÜR DIE ESELSBRÜCKE ('mnemonic'):
1. KLANGWORT (Schlüsselwort): Finde ein deutsches Wort, das lautmalerisch ähnlich wie das englische Wort klingt (z. B. where -> Wehr, bee -> Biber, balloon -> Bell-Huhn, red -> retten).
   - Auch für sehr kurze Wörter oder Präpositionen (at, now, in, to) MUSS ein deutsches Klangbild gewählt werden (z. B. 'now' klingt wie 'genau', 'at' klingt wie 'Bett').
2. BILDHAFTE SZENE: Verbinde dieses deutsche Klangwort in einer lustigen, lebendigen oder überraschenden Szene direkt mit der DEUTSCHEN Übersetzung.
3. STRENG VERBOTEN: Reine Übersetzungs-Wiederholungen wie "X ist englisch für Y", "Das englische Wort für Y ist X" oder "Merk dir einfach Y". Es MUSS ein Klangwort vorkommen!
4. Strikte Jugendfreiheit, altersgerecht für 11- bis 13-Jährige.

REGELN FÜR BEISPIELSATZ & LÜCKENTEXT:
- 'contextSentence': Ein einfacher, alltagsnaher englischer Beispielsatz auf A1/A2-Niveau.
- 'gapText': EXAKT derselbe Satz wie 'contextSentence', bei dem das englische Zielwort durch genau '___' (drei Unterstriche) ersetzt ist.

BEISPIELE (Few-Shot):
- where (wo / wohin): "Klingt wie 'Wehr': Wo fließt das Wasser hin? Genau über das große Wehr am Fluss!"
- now (jetzt / nun): "„Genau (klingt wie now) in dieser Sekunde!“, ruft der Schiri, denn jetzt geht das Spiel los."
- listen (zuhören): "Du liest deinen Freunden lange Listen (klingt wie listen) vor und alle müssen ganz leise zuhören."
- bike (Fahrrad): "Ein Ritter schwingt ein Beil (klingt wie bike), während er schnell mit dem Fahrrad über die Brücke saust."

Hier sind die Vokabeln:
${JSON.stringify(cards, null, 2)}

Antworte ausschließlich im JSON-Format als Liste von Objekten mit den Feldern: id, mnemonic, contextSentence, gapText.
`;

  let enrichedCards: any;

  if (apiKeys && apiKeys.length > 0) {
    const provider = new GeminiProvider(apiKeys);
    enrichedCards = await provider.generateStructuredJson({ prompt: promptText });
  } else {
    const { provider } = await getActiveAiProvider(userId);
    enrichedCards = await provider.generateStructuredJson({ prompt: promptText });
  }

  // Robuste Nachbearbeitung & Lückentext-Garantie
  if (Array.isArray(enrichedCards)) {
    const cardMap = new Map(cards.map((c: any) => [c.id, c]));

    enrichedCards = enrichedCards.map((card: any) => {
      const originalCard = cardMap.get(card.id);
      let gapText = card.gapText;
      const context = card.contextSentence;

      // Fallback: Falls gapText fehlt, ungültig ist oder keine '___' enthält / Klammern setzt
      if (context && originalCard?.front) {
        if (typeof gapText === "string") {
          gapText = gapText.replace(/\[\s*___\s*\]|\(\s*___\s*\)/g, "___");
        }

        if (!gapText || !gapText.includes("___") || gapText.trim() === "___") {
          // Ersetze das Zielwort im Beispielsatz deterministisch durch ___
          const wordToReplace = originalCard.front.trim().replace(/^(to\s+)/i, ""); // z. B. "to listen" -> "listen"
          const escapedWord = wordToReplace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const regex = new RegExp(`\\b${escapedWord}\\b`, "i");
          if (regex.test(context)) {
            gapText = context.replace(regex, "___");
          }
        }

        if (typeof gapText === "string") {
          gapText = gapText.replace(/\[\s*___\s*\]|\(\s*___\s*\)/g, "___");
        }
      }

      return {
        ...card,
        gapText: gapText && gapText.trim() !== "___" && gapText.includes("___") ? gapText : null,
      };
    });
  }

  return enrichedCards;
}
