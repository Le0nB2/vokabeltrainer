"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAppAuth, getCurrentUser } from "@/lib/auth-guard"

async function verifyDeckAccess(deckId: string) {
  const user = await getCurrentUser();
  if (!user || user.id === "default") return;

  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    select: { userId: true },
  });

  if (!deck) {
    throw new Error("Deck nicht gefunden");
  }

  const isOwner = deck.userId === user.id || (user.role === "ADMIN" && !deck.userId);
  if (!isOwner) {
    throw new Error("Keine Berechtigung für dieses Deck");
  }
}

function sanitizeField(val: string | null | undefined, maxLen: number): string | null | undefined {
  if (val === undefined) return undefined;
  if (val === null) return null;
  return val.slice(0, maxLen);
}

export async function addCard(
  deckId: string,
  front: string,
  back: string,
  notes?: string | null,
  gapText?: string | null,
  mnemonic?: string | null,
  contextSentence?: string | null
) {
  await requireAppAuth();
  await verifyDeckAccess(deckId);
  if (!deckId || typeof deckId !== "string" || deckId.length > 100) {
    throw new Error("Ungültige Deck-ID");
  }
  const cleanFront = (front || "").trim().slice(0, 2000);
  const cleanBack = (back || "").trim().slice(0, 2000);
  if (!cleanFront || !cleanBack) {
    throw new Error("Vorder- und Rückseite dürfen nicht leer sein");
  }

  const card = await prisma.card.create({
    data: {
      deckId,
      front: cleanFront,
      back: cleanBack,
      notes: sanitizeField(notes, 2000),
      gapText: sanitizeField(gapText, 2000),
      mnemonic: sanitizeField(mnemonic, 1000),
      contextSentence: sanitizeField(contextSentence, 2000),
      language: "en",
    }
  });
  revalidatePath(`/decks/${deckId}`);
  return card;
}

export async function addCardsBulk(
  deckId: string,
  cards: {
    front: string;
    back: string;
    notes?: string;
    gapText?: string;
    mnemonic?: string;
    contextSentence?: string | null;
    phonetic?: string | null;
  }[]
) {
  await requireAppAuth();
  await verifyDeckAccess(deckId);
  if (!deckId || typeof deckId !== "string" || deckId.length > 100) {
    throw new Error("Ungültige Deck-ID");
  }
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error("Mindestens eine Karte erforderlich");
  }

  const maxBulkCards = 500;
  const limitedCards = cards.slice(0, maxBulkCards);

  const created = await prisma.card.createMany({
    data: limitedCards
      .map(c => {
        const cleanFront = (c.front || "").trim().slice(0, 2000);
        const cleanBack = (c.back || "").trim().slice(0, 2000);
        const rawNotes = c.phonetic ? (c.notes ? `${c.phonetic}\n${c.notes}` : c.phonetic) : c.notes;
        return {
          deckId,
          front: cleanFront,
          back: cleanBack,
          notes: sanitizeField(rawNotes, 2000),
          gapText: sanitizeField(c.gapText, 2000),
          mnemonic: sanitizeField(c.mnemonic, 1000),
          contextSentence: sanitizeField(c.contextSentence, 2000),
          box: 1,
          dueDate: new Date(),
          language: "en",
        };
      })
      .filter(c => c.front && c.back)
  });
  revalidatePath(`/decks/${deckId}`);
  return created;
}

export async function deleteCard(cardId: string, deckId: string) {
  await requireAppAuth();
  await verifyDeckAccess(deckId);
  await prisma.card.delete({
    where: { id: cardId }
  });
  revalidatePath(`/decks/${deckId}`);
}

export async function updateCardProgress(cardId: string, deckId: string, rating: "again" | "hard" | "good" | "easy") {
  await requireAppAuth();
  await verifyDeckAccess(deckId);
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) throw new Error("Card not found");

  const now = new Date();
  let newBox = card.box;
  let newEaseFactor = card.easeFactor;
  let newLapses = card.lapses;
  let newConsecutive = card.consecutiveCorrect;
  let isCorrect = true;

  if (rating === 'again') {
    newBox = 1;
    newLapses += 1;
    newEaseFactor = Math.max(1.3, newEaseFactor - 0.20);
    newConsecutive = 0;
    isCorrect = false;
  } else if (rating === 'hard') {
    newBox = Math.max(1, Math.round(newBox * 1.2));
    newEaseFactor = Math.max(1.3, newEaseFactor - 0.15);
    newConsecutive += 1;
  } else if (rating === 'good') {
    newBox = Math.max(1, Math.round(newBox === 0 ? 1 : newBox * newEaseFactor));
    newConsecutive += 1;
  } else if (rating === 'easy') {
    newBox = Math.max(1, Math.round(newBox === 0 ? 4 : newBox * newEaseFactor * 1.3));
    newEaseFactor += 0.15;
    newConsecutive += 1;
  }

  const dueDate = new Date(now.getTime() + Math.round(newBox) * 24 * 60 * 60 * 1000);

  const updatedCard = await prisma.card.update({
    where: { id: cardId },
    data: {
      box: newBox,
      easeFactor: newEaseFactor,
      lapses: newLapses,
      consecutiveCorrect: newConsecutive,
      lastReviewed: now,
      dueDate,
    }
  });

  await prisma.reviewLog.create({
    data: {
      cardId,
      deckId,
      isCorrect,
    }
  });

  return updatedCard;
}

export async function getAllDueCards() {
  await requireAppAuth();
  const user = await getCurrentUser();
  const now = new Date();

  const deckCondition =
    !user || user.id === "default"
      ? undefined
      : user.role === "ADMIN"
      ? {
          OR: [{ userId: user.id }, { userId: null }],
        }
      : { userId: user.id };

  const dueCards = await prisma.card.findMany({
    where: {
      dueDate: {
        lte: now
      },
      ...(deckCondition && { deck: deckCondition }),
    },
    include: { deck: true }
  });
  return dueCards;
}

export async function updateCardDetails(
  cardId: string,
  deckId: string,
  front: string,
  back: string,
  notes?: string | null,
  gapText?: string | null,
  mnemonic?: string | null,
  contextSentence?: string | null
) {
  await requireAppAuth();
  await verifyDeckAccess(deckId);
  if (!cardId || typeof cardId !== "string" || cardId.length > 100) {
    throw new Error("Ungültige Card-ID");
  }
  const cleanFront = (front || "").trim().slice(0, 2000);
  const cleanBack = (back || "").trim().slice(0, 2000);
  if (!cleanFront || !cleanBack) {
    throw new Error("Vorder- und Rückseite dürfen nicht leer sein");
  }

  const updated = await prisma.card.update({
    where: { id: cardId },
    data: {
      front: cleanFront,
      back: cleanBack,
      notes: sanitizeField(notes, 2000),
      gapText: sanitizeField(gapText, 2000),
      mnemonic: sanitizeField(mnemonic, 1000),
      contextSentence: sanitizeField(contextSentence, 2000),
    }
  });
  revalidatePath(`/decks/${deckId}`);
  return updated;
}

export async function updateCardsEnrichmentBulk(
  deckId: string,
  updates: {
    id: string;
    gapText?: string | null;
    mnemonic?: string | null;
    contextSentence?: string | null;
  }[]
) {
  await requireAppAuth();
  await verifyDeckAccess(deckId);
  if (!Array.isArray(updates) || updates.length === 0) return;
  const limitedUpdates = updates.slice(0, 500);

  for (const update of limitedUpdates) {
    if (!update.id || typeof update.id !== "string") continue;
    await prisma.card.update({
      where: { id: update.id },
      data: {
        ...(update.gapText !== undefined && { gapText: sanitizeField(update.gapText, 2000) }),
        ...(update.mnemonic !== undefined && { mnemonic: sanitizeField(update.mnemonic, 1000) }),
        ...(update.contextSentence !== undefined && { contextSentence: sanitizeField(update.contextSentence, 2000) }),
      },
    });
  }
  revalidatePath(`/decks/${deckId}`);
}
