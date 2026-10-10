"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function getDecks() {
  return await prisma.deck.findMany({
    include: {
      _count: {
        select: { cards: true }
      },
      cards: {
        select: { box: true, dueDate: true }
      }
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function getDeckById(id: string) {
  return await prisma.deck.findUnique({
    where: { id },
    include: {
      cards: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          front: true,
          back: true,
          notes: true,
          box: true,
          gapText: true,
          lapses: true,
          mnemonic: true,
          contextSentence: true,
          dueDate: true,
          createdAt: true
        }
      }
    }
  });
}

export async function createDeck(title: string, description?: string) {
  const deck = await prisma.deck.create({
    data: {
      title,
      description
    }
  });
  revalidatePath("/");
  return deck;
}

export async function deleteDeck(id: string) {
  await prisma.deck.delete({
    where: { id }
  });
  revalidatePath("/");
}

export async function saveDeckResult(id: string, correct: number, incorrect: number) {
  return await prisma.deck.update({
    where: { id },
    data: {
      lastResultCorrect: correct,
      lastResultIncorrect: incorrect
    }
  });
}
