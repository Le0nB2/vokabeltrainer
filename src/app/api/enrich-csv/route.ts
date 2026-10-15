import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enrichCards, QuotaExceededError } from "@/lib/services/ai-enrichment";


const cardSchema = z.object({
  id: z.string(),
  front: z.string(),
  back: z.string()
});

const requestSchema = z.object({
  cards: z.array(cardSchema).min(1)
});

export async function POST(req: NextRequest) {
  try {

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
