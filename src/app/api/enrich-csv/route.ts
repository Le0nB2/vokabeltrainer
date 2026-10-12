import { NextRequest, NextResponse } from "next/server";
import { enrichCards, QuotaExceededError } from "@/lib/services/ai-enrichment";

export async function POST(req: NextRequest) {
  try {
    const { cards } = await req.json();

    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return NextResponse.json({ error: "No cards provided" }, { status: 400 });
    }

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
    return NextResponse.json({ error: (error as Error).message || String(error) || "Internal server error" }, { status: 500 });
  }
}
