"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAppAuth } from "@/lib/auth-guard"


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
  const card = await prisma.card.create({
    data: {
      deckId,
      front,
      back,
      notes,
      gapText,
      mnemonic,
      contextSentence,
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
  const created = await prisma.card.createMany({
    data: cards.map(c => ({
      deckId,
      front: c.front,
      back: c.back,
      notes: c.phonetic ? (c.notes ? `${c.phonetic}\n${c.notes}` : c.phonetic) : c.notes,
      gapText: c.gapText,
      mnemonic: c.mnemonic,
      contextSentence: c.contextSentence,
      box: 1,
      dueDate: new Date(),
    }))
  });
  revalidatePath(`/decks/${deckId}`);
  return created;
}

export async function deleteCard(cardId: string, deckId: string) {
  await requireAppAuth();
  await prisma.card.delete({
    where: { id: cardId }
  });
  revalidatePath(`/decks/${deckId}`);
}

export async function updateCardProgress(cardId: string, deckId: string, rating: "again" | "hard" | "good" | "easy") {
  await requireAppAuth();
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
  const now = new Date();
  const dueCards = await prisma.card.findMany({
    where: {
      dueDate: {
        lte: now
      }
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
  const updated = await prisma.card.update({
    where: { id: cardId },
    data: {
      front,
      back,
      notes,
      gapText,
      mnemonic,
      contextSentence,
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
  for (const update of updates) {
    await prisma.card.update({
      where: { id: update.id },
      data: {
        ...(update.gapText !== undefined && { gapText: update.gapText }),
        ...(update.mnemonic !== undefined && { mnemonic: update.mnemonic }),
        ...(update.contextSentence !== undefined && { contextSentence: update.contextSentence }),
      },
    });
  }
  revalidatePath(`/decks/${deckId}`);
}
