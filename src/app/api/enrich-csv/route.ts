import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enrichCards, QuotaExceededError } from "@/lib/services/ai-enrichment";
import { requireAppAuth, UnauthorizedError } from "@/lib/auth-guard";
import { consumeRateLimit, formatRetryDuration, getClientIpFromHeaders } from "@/lib/rate-limit";

export const MAX_CARDS_PER_ENRICH_REQUEST = 50;
export const MAX_TEXT_LENGTH_PER_CARD = 500;

const cardSchema = z.object({
  id: z.string().min(1, "ID darf nicht leer sein").max(100, "ID darf maximal 100 Zeichen lang sein"),
  front: z
    .string()
    .trim()
    .min(1, "Vorderseite darf nicht leer sein")
    .max(MAX_TEXT_LENGTH_PER_CARD, `Vorderseite darf maximal ${MAX_TEXT_LENGTH_PER_CARD} Zeichen lang sein`),
  back: z
    .string()
    .trim()
    .min(1, "Rückseite darf nicht leer sein")
    .max(MAX_TEXT_LENGTH_PER_CARD, `Rückseite darf maximal ${MAX_TEXT_LENGTH_PER_CARD} Zeichen lang sein`),
});

const requestSchema = z.object({
  cards: z
    .array(cardSchema)
    .min(1, "Mindestens eine Karte erforderlich")
    .max(MAX_CARDS_PER_ENRICH_REQUEST, `Maximal ${MAX_CARDS_PER_ENRICH_REQUEST} Karten pro Anfrage erlaubt`),
});

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
    const limit = consumeRateLimit(`enrich-csv:${clientIp}`, {
      maxAttempts: 10,
      windowMs: 60 * 1000,
      blockDurationMs: 60 * 1000,
    });

    if (limit.isBlocked) {
      return NextResponse.json(
        {
          error: `Zu viele Anfragen zur KI-Anreicherung. Bitte warte ${formatRetryDuration(limit.retryAfterSeconds)}.`,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parseResult = requestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid input", details: parseResult.error.format() }, { status: 400 });
    }

    const { cards } = parseResult.data;

    const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY;
    if (!rawKeys) {
      return NextResponse.json({ error: "GEMINI_API_KEYS is not configured" }, { status: 500 });
    }
    const apiKeys = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);

    if (apiKeys.length === 0) {
      return NextResponse.json({ error: "No valid API keys found" }, { status: 500 });
    }

    const enrichedCards = await enrichCards(cards, apiKeys);

    return NextResponse.json({ cards: enrichedCards });

  } catch (error: unknown) {
    if (error instanceof QuotaExceededError) {
      return NextResponse.json(
        { error: error.message },
        { status: 429 }
      );
    }
    console.error("Enrich CSV error:", error);
    return NextResponse.json({ error: "Fehler bei der KI-Anreicherung. Bitte versuche es erneut." }, { status: 500 });
  }
}
