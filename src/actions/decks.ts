"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAppAuth, getCurrentUser } from "@/lib/auth-guard"

export async function getDecks() {
  await requireAppAuth();
  const user = await getCurrentUser();

  const userCondition =
    !user || user.id === "default"
      ? undefined
      : user.role === "ADMIN"
      ? {
          OR: [{ userId: user.id }, { userId: null }],
        }
      : { userId: user.id };

  return await prisma.deck.findMany({
    where: userCondition,
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
  const user = await getCurrentUser();
  if (!user) return null;

  const deck = await prisma.deck.findUnique({
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
          createdAt: true,
          language: true,
        }
      }
    }
  });

  if (!deck) return null;

  if (user.id !== "default") {
    const isOwner = deck.userId === user.id || (user.role === "ADMIN" && !deck.userId);
    if (!isOwner) {
      throw new Error("Keine Berechtigung für dieses Deck");
    }
  }

  return deck;
}

export async function createDeck(title: string, description?: string, targetLanguage = "en") {
  await requireAppAuth();
  const user = await getCurrentUser();
  const cleanTitle = (title || "").trim().slice(0, 200);
  if (!cleanTitle) {
    throw new Error("Titel darf nicht leer sein");
  }
  const cleanDescription = description ? description.trim().slice(0, 2000) : null;

  // Only assign userId if the user is a persistent database user.
  // Synthetic users ("admin", "default", "env-admin") do not have a record in the User table,
  // which would trigger a foreign key violation (P2003 / Deck_userId_fkey) in PostgreSQL.
  const targetUserId =
    user &&
    user.id &&
    user.id !== "default" &&
    user.id !== "admin" &&
    user.id !== "env-admin"
      ? user.id
      : null;

  const deck = await prisma.deck.create({
    data: {
      title: cleanTitle,
      description: cleanDescription,
      targetLanguage,
      userId: targetUserId,
    }
  });
  revalidatePath("/");
  return deck;
}

export async function deleteDeck(id: string) {
  await requireAppAuth();
  const user = await getCurrentUser();
  if (!user) throw new Error("Nicht autorisiert");

  const deck = await prisma.deck.findUnique({ where: { id } });
  if (!deck) return;

  if (user.id !== "default") {
    const isOwner = deck.userId === user.id || (user.role === "ADMIN" && !deck.userId);
    if (!isOwner) {
      throw new Error("Keine Berechtigung zum Löschen dieses Decks");
    }
  }

  await prisma.deck.delete({
    where: { id }
  });
  revalidatePath("/");
}

export async function saveDeckResult(id: string, correct: number, incorrect: number) {
  await requireAppAuth();
  const user = await getCurrentUser();
  if (!user) throw new Error("Nicht autorisiert");

  const deck = await prisma.deck.findUnique({ where: { id } });
  if (!deck) throw new Error("Deck nicht gefunden");

  if (user.id !== "default") {
    const isOwner = deck.userId === user.id || (user.role === "ADMIN" && !deck.userId);
    if (!isOwner) {
      throw new Error("Keine Berechtigung");
    }
  }

  return await prisma.deck.update({
    where: { id },
    data: {
      lastResultCorrect: correct,
      lastResultIncorrect: incorrect
    }
  });
}
