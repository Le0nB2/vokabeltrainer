import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { requireAppAuth, UnauthorizedError } from "@/lib/auth-guard";
import { consumeRateLimit, formatRetryDuration, getClientIpFromHeaders } from "@/lib/rate-limit";
import { callGeminiWithRetry, QuotaExceededError } from "@/lib/services/gemini-executor";

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
    const limit = consumeRateLimit(`scan-image:${clientIp}`, {
      maxAttempts: 5,
      windowMs: 60 * 1000,
      blockDurationMs: 60 * 1000,
    });

    if (limit.isBlocked) {
      return NextResponse.json(
        {
          error: `Zu viele Anfragen zur Bildanalyse. Bitte warte ${formatRetryDuration(limit.retryAfterSeconds)}.`,
        },
        { status: 429 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("image") as File;

    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Limit upload size to 10MB to prevent memory exhaustion / DoS
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Datei ist zu groß (maximal 10 MB erlaubt)" }, { status: 400 });
    }

    // Validate MIME type
    const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    const mimeType = file.type || "image/jpeg";
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json({ error: "Ungültiger Dateityp (nur JPEG, PNG, WebP erlaubt)" }, { status: 400 });
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

    const prompt = `Du bist ein didaktischer Englischlehrer für Schüler im Alter von 11 bis 13 Jahren (5.–7. Klasse). Extrahiere alle Vokabelpaare aus diesem Foto (Buchseite, Liste, Notizbuch).

WICHTIGE REGELN:
1. Trenne das englische Ausgangswort ('front') und die deutsche Übersetzung/Bedeutung ('back') exakt. Korrigiere offensichtliche Lesefehler.
   - WICHTIG: Keine Klammern in Sätzen oder Wörtern (z. B. "It's your turn" statt "(It's) your turn", "to find" statt "(to) find").
2. Exakte Buch-Bedeutung priorisieren: Wenn das Buch für ein Wort eine spezifische Bedeutung angibt (z.B. "year" = "der Jahrgang / die Jahrgangsstufe"), muss genau diese Bedeutung für 'back' und für den Beispielsatz 'contextSentence' verwendet werden.
3. Saubere Übernahme von Alternativen: Trennungen mit Schrägstrich aus dem Buch (z.B. "Du bist dran / an der Reihe" oder "das Sandwich, (zusammengeklapptes) belegtes Brot") sollen im Feld 'back' vollständig erhalten bleiben und nicht abgeschnitten werden.
4. Lautschrift: Falls auf dem Bild Lautschrift vorhanden ist, extrahiere sie in eckigen Klammern (z.B. [bɔːl]) in das Feld 'phonetic', sonst leer.
5. Hinweise & Grammatik: Lese die Zusatzspalte rechts konsequent aus und schreibe sie in das Feld 'notes' (z.B. Gegenteile "new ◄► old", Fragen "How old are you, please?", Aussprache-Tipps, Signalwörter, grammatikalische Besonderheiten).
6. Eselsbrücken ('mnemonic') nach der Schlüsselwortmethode:
   - Finde ein DEUTSCHES Wort, das lautmalerisch an das englische Wort erinnert (Klangwort).
   - KEINE Fantasiewörter! Das deutsche Klangwort MUSS ein echtes, existierendes deutsches Wort aus dem Duden sein.
   - ACHTUNG KOGNATE: Falls das englische Wort bereits ein deutsches Lehnwort/Kognat ist (wie "ball", "orange", "sandwich", "banana"), erfinde KEIN künstliches Klangwort (keine Binsenweisheiten wie "Ball klingt wie Ball"). Baue stattdessen eine kurze, merkfähige Szene oder weise auf Besonderheiten (z. B. die englische Aussprache) hin.
   - Falls kein direktes deutsches Klangwort existiert, wähle ein Teilwort oder eine treffende lautmalerische Assoziation (z.B. "please" -> "Prise", "wrong" -> "Gong").
   - Verknüpfe dieses Klangwort in einer kurzen, bildhaften Szene mit der deutschen Übersetzung. Keine reinen Reime ohne Klangbezug, keine Beleidigungen, strikt jugendfrei.
7. Erstelle einen einfachen englischen Beispielsatz ('contextSentence'). Dieser darf keine optionalen Klammern enthalten.
8. Erstelle zwingend einen Lückentext ('gapText'), der EXAKT derselbe Satz wie 'contextSentence' ist, bei dem jedoch AUSSCHLIESSLICH das Zielwort oder die Kernphrase aus 'front' durch '___' ersetzt wurde.
9. Ignoriere Seitenzahlen und Überschriften.`;

    const parsedCards = await callGeminiWithRetry({
      endpoint: "scan-image",
      apiKeys,
      execute: async (ai, modelToUse) => {
        const response = await ai.models.generateContent({
          model: modelToUse,
          contents: [
            prompt,
            { inlineData: { data: base64Image, mimeType: mimeType } },
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

        let cards = JSON.parse(textResponse);

        // Cleanup step: if gapText only contains "___", set it to null
        if (Array.isArray(cards)) {
          cards = cards.map((card: any) => {
            if (card.gapText && card.gapText.trim() === "___") {
              return { ...card, gapText: null };
            }
            return card;
          });
        }

        return cards;
      },
    });

    return NextResponse.json({ cards: parsedCards });
  } catch (error: unknown) {
    if (error instanceof QuotaExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error("Scan error:", error);
    return NextResponse.json({ error: "Fehler bei der Bildanalyse. Bitte versuche es erneut." }, { status: 500 });
  }
}
