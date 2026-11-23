import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { requireAppAuth, UnauthorizedError } from "@/lib/auth-guard";
import { consumeRateLimit, formatRetryDuration, getClientIpFromHeaders } from "@/lib/rate-limit";
import { callGeminiWithRetry, QuotaExceededError } from "@/lib/services/gemini-executor";
import { getActiveAiProvider } from "@/lib/ai/ai-router";
import { enrichCards } from "@/lib/services/ai-enrichment";
import { triggerBackgroundEnrichment } from "@/lib/services/background-enricher";
import prisma from "@/lib/prisma";

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
    const deckId = (formData.get("deckId") as string) || null;

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

    let aiConfig: any = null;
    try {
      aiConfig = await getActiveAiProvider();
    } catch {
      // ignore
    }

    // Read multiple keys or fallback to single key
    const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY;
    const envApiKeys = rawKeys
      ? rawKeys.split(",").map((k) => k.trim()).filter((k) => k.length > 0)
      : [];

    if (!aiConfig && envApiKeys.length === 0) {
      return NextResponse.json(
        { error: "Kein aktiver KI-Dienst konfiguriert. Bitte hinterlege einen API-Schlüssel für Google Gemini." },
        { status: 500 }
      );
    }

    // Convert File to base64
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString("base64");

    // ==========================================
    // SOFORT-PHASE: Schnelles Auslesen aus Bild
    // ==========================================
    const scanPrompt = `Du bist ein didaktischer Englischlehrer für Schüler im Alter von 11 bis 13 Jahren (5.–7. Klasse). Extrahiere alle Vokabelpaare aus diesem Foto (Buchseite, Liste, Notizbuch).

WICHTIGE REGELN:
1. Trenne das englische Ausgangswort ('front') und die deutsche Übersetzung/Bedeutung ('back') exakt. Korrigiere offensichtliche Lesefehler.
   - WICHTIG: Keine Klammern in Sätzen oder Wörtern (z. B. "It's your turn" statt "(It's) your turn", "to find" statt "(to) find").
2. Exakte Buch-Bedeutung priorisieren: Wenn das Buch für ein Wort eine spezifische Bedeutung angibt (z.B. "year" = "der Jahrgang / die Jahrgangsstufe"), muss genau diese Bedeutung für 'back' verwendet werden.
3. Saubere Übernahme von Alternativen: Trennungen mit Schrägstrich oder Komma/Semikolon aus dem Buch (z.B. "Du bist dran / an der Reihe") sollen im Feld 'back' erhalten bleiben. Wenn im Buch zusätzliche Erläuterungen oder Einschränkungen in Klammern stehen (z.B. "(im Haus)" oder "(Landstraße zwischen Orten)"), packe diese Erläuterungen mit in das Feld 'notes', damit 'back' prägnant und kindgerecht bleibt (z.B. 'back': "oben, nach oben", 'notes': "im Haus").
4. Lautschrift: Falls auf dem Bild Lautschrift vorhanden ist, extrahiere sie in eckigen Klammern (z.B. [bɔːl]) in das Feld 'phonetic', sonst leer.
5. Hinweise & Grammatik: Lese die Zusatzspalte rechts konsequent aus und schreibe sie in das Feld 'notes' (z.B. Gegenteile "new ◄► old", Fragen "How old are you, please?", Aussprache-Tipps, Signalwörter, grammatikalische Besonderheiten).
6. Ignoriere Seitenzahlen und Überschriften.`;

    let rawExtractedCards: Array<{
      front: string;
      back: string;
      notes?: string;
      phonetic?: string;
    }> = [];

    if (aiConfig?.providerId === "openrouter" || aiConfig?.providerId === "openai") {
      rawExtractedCards = await aiConfig.provider.generateStructuredJson({
        prompt:
          scanPrompt +
          "\n\nAntworte ausschließlich im JSON-Format als Liste von Objekten mit den Feldern: front, back, phonetic, notes.",
        image: { data: base64Image, mimeType },
      });
    } else {
      const apiKeys = (aiConfig?.provider as any)?.apiKeys || envApiKeys;
      rawExtractedCards = await callGeminiWithRetry({
        endpoint: "scan-image",
        apiKeys,
        execute: async (ai, modelToUse) => {
          const response = await ai.models.generateContent({
            model: modelToUse,
            contents: [scanPrompt, { inlineData: { data: base64Image, mimeType } }],
            config: {
              responseMimeType: "application/json",
              responseJsonSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    phonetic: {
                      type: Type.STRING,
                      description:
                        "Die Lautschrift in eckigen Klammern, wie auf dem Bild angegeben, z. B. [bɔːl]. Sonst leer.",
                    },
                    front: {
                      type: Type.STRING,
                      description: "Das englische Ausgangswort",
                    },
                    back: {
                      type: Type.STRING,
                      description:
                        "Die deutsche Übersetzung oder Bedeutung. Spezifische Bedeutungen aus dem Buch priorisieren. Alternativen mit Schrägstrich oder Klammern vollständig erhalten.",
                    },
                    notes: {
                      type: Type.STRING,
                      description:
                        "Zusatzinfos aus der dritten Spalte rechts, z.B. Gegenteile ('new ◄► old'), typische Beispielsätze/Fragen ('How old are you, please?'), Aussprache-Tipps, Signalwörter oder grammatikalische Besonderheiten. Lese diese Spalte konsequent aus. Sonst leer.",
                    },
                  },
                  required: ["front", "back"],
                },
              },
            },
          });

          const textResponse = response.text;
          if (!textResponse) {
            throw new Error("Failed to generate text from Gemini");
          }

          let cards = JSON.parse(textResponse);
          return Array.isArray(cards) ? cards : [];
        },
      });
    }

    if (!Array.isArray(rawExtractedCards) || rawExtractedCards.length === 0) {
      return NextResponse.json({ cards: [] });
    }

    // Filter cards with front & back
    const validRawCards = rawExtractedCards.filter((c) => c.front?.trim() && c.back?.trim());

    // Falls deckId übergeben wurde, legen wir die Karten direkt im Deck mit PENDING an
    let createdCardsInDb: Array<{ id: string; front: string; back: string; notes?: string | null }> = [];
    if (deckId) {
      await prisma.$transaction(
        validRawCards.map((c) => {
          const rawNotes = c.phonetic ? (c.notes ? `${c.phonetic}\n${c.notes}` : c.phonetic) : c.notes;
          return prisma.card.create({
            data: {
              deckId,
              front: c.front.trim().slice(0, 2000),
              back: c.back.trim().slice(0, 2000),
              notes: rawNotes ? rawNotes.slice(0, 2000) : null,
              enrichmentStatus: "PENDING",
              box: 1,
              dueDate: new Date(),
              language: "en",
            },
            select: { id: true, front: true, back: true, notes: true },
          });
        })
      ).then((res) => {
        createdCardsInDb = res;
      });
    }

    // ==========================================
    // ANREICHERUNGS-PHASE (synchroner Key-Durchlauf)
    // ==========================================
    const cardsToEnrich = validRawCards.map((c, index) => ({
      id: createdCardsInDb[index]?.id || `temp_${index}`,
      front: c.front,
      back: c.back,
    }));

    try {
      const apiKeys = (aiConfig?.provider as any)?.apiKeys || (envApiKeys.length > 0 ? envApiKeys : undefined);
      const enrichedResult = await enrichCards(cardsToEnrich, apiKeys);

      // Zusammenführen mit Lautschrift / Notizen
      const enrichedMap = new Map<string, any>((enrichedResult || []).map((e: any) => [e.id, e]));

      const fullCards = validRawCards.map((c, index) => {
        const id = createdCardsInDb[index]?.id || `temp_${index}`;
        const enriched = enrichedMap.get(id);
        return {
          id: createdCardsInDb[index]?.id,
          front: c.front,
          back: c.back,
          notes: c.notes || "",
          phonetic: c.phonetic || "",
          gapText: enriched?.gapText || null,
          mnemonic: enriched?.mnemonic || null,
          contextSentence: enriched?.contextSentence || null,
        };
      });

      // Wenn Karten in DB angelegt wurden, updaten wir sie auf DONE
      if (deckId && createdCardsInDb.length > 0) {
        await prisma.$transaction(
          fullCards
            .filter((c) => c.id)
            .map((c) =>
              prisma.card.update({
                where: { id: c.id! },
                data: {
                  gapText: c.gapText,
                  mnemonic: c.mnemonic,
                  contextSentence: c.contextSentence,
                  enrichmentStatus: "DONE",
                },
              })
            )
        );
      }

      // Synchroner Key hatte Kontingent -> Reguläre Kontrollmaske im UI anzeigen
      return NextResponse.json({
        cards: fullCards,
        backgroundEnrichment: false,
      });
    } catch (enrichError: unknown) {
      const isQuota =
        enrichError instanceof QuotaExceededError ||
        (enrichError instanceof Error && enrichError.message.toLowerCase().includes("quota")) ||
        (enrichError as any)?.status === 429;

      if (isQuota) {
        // Erst wenn ALLE verfügbaren Keys ihr Kontingent überschritten haben (429):
        // Browser nicht blockieren! Hintergrund-Worker übernimmt Wartepause (60s)
        triggerBackgroundEnrichment({ waitInitial: true });

        const pendingCount = validRawCards.length;
        return NextResponse.json({
          backgroundEnrichment: true,
          pendingCount,
          cards: validRawCards.map((c, idx) => ({
            id: createdCardsInDb[idx]?.id,
            front: c.front,
            back: c.back,
            notes: c.notes || "",
            phonetic: c.phonetic || "",
            gapText: null,
            mnemonic: null,
            contextSentence: null,
          })),
          message: `Kontingent aller Schlüssel erschöpft. Die restlichen ${pendingCount} Karten werden im Hintergrund vervollständigt.`,
        });
      }

      // Bei anderen Fehlern trotzdem Rohkarten zurückgeben
      console.error("Enrichment error during scan:", enrichError);
      return NextResponse.json({
        cards: validRawCards.map((c, idx) => ({
          id: createdCardsInDb[idx]?.id,
          front: c.front,
          back: c.back,
          notes: c.notes || "",
          phonetic: c.phonetic || "",
        })),
        backgroundEnrichment: false,
      });
    }
  } catch (error: unknown) {
    if (error instanceof QuotaExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error("Scan error:", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Fehler bei der Bildanalyse. Bitte versuche es erneut.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
