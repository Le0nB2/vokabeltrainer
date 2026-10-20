"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAppAuth } from "@/lib/auth-guard"

export async function getDecks() {
  await requireAppAuth();
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
  await requireAppAuth();
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
  await requireAppAuth();
  const cleanTitle = (title || "").trim().slice(0, 200);
  if (!cleanTitle) {
    throw new Error("Titel darf nicht leer sein");
  }
  const cleanDescription = description ? description.trim().slice(0, 2000) : null;
  const deck = await prisma.deck.create({
    data: {
      title: cleanTitle,
      description: cleanDescription
    }
  });
  revalidatePath("/");
  return deck;
}

export async function deleteDeck(id: string) {
  await requireAppAuth();
  await prisma.deck.delete({
    where: { id }
  });
  revalidatePath("/");
}

export async function saveDeckResult(id: string, correct: number, incorrect: number) {
  await requireAppAuth();
  return await prisma.deck.update({
    where: { id },
    data: {
      lastResultCorrect: correct,
      lastResultIncorrect: incorrect
    }
  });
}
