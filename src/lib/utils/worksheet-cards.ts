export interface WorksheetSelectableCard {
  id: string;
  dueDate: Date;
  lapses?: number;
  reviewLogs?: { isCorrect: boolean }[];
}

/**
 * Selects up to `maxCards` for a worksheet.
 * Up to 1/4 of the selected cards are prioritized from cards that were
 * recently answered incorrectly or repeated often (`lapses >= 2`).
 * Remaining slots are filled with due cards first, then non-due cards.
 */
export function selectWorksheetCards<T extends WorksheetSelectableCard>(
  cards: T[],
  maxCards = 60,
  now = new Date()
): T[] {
  const maxTotal = Math.min(maxCards, cards.length);
  if (maxTotal === 0) return [];

  const maxProblemCards = Math.floor(maxTotal / 4);

  const isLastWrong = (c: T) => c.reviewLogs?.[0]?.isCorrect === false;
  const isProblemCard = (c: T) => isLastWrong(c) || (c.lapses ?? 0) >= 2;

  const problemCards = cards.filter(isProblemCard);
  const regularCards = cards.filter((c) => !isProblemCard(c));

  problemCards.sort((a, b) => {
    const aWrong = isLastWrong(a) ? 1 : 0;
    const bWrong = isLastWrong(b) ? 1 : 0;
    if (bWrong !== aWrong) return bWrong - aWrong;

    const lapseDiff = (b.lapses ?? 0) - (a.lapses ?? 0);
    if (lapseDiff !== 0) return lapseDiff;

    return 0.5 - Math.random();
  });

  const selectedProblemCards = problemCards.slice(0, maxProblemCards);
  const leftoverProblemCards = problemCards.slice(maxProblemCards);

  const dueRegular = regularCards.filter((c) => c.dueDate <= now);
  const notDueRegular = regularCards.filter((c) => c.dueDate > now);

  dueRegular.sort(() => 0.5 - Math.random());
  notDueRegular.sort(() => 0.5 - Math.random());

  return [
    ...selectedProblemCards,
    ...dueRegular,
    ...notDueRegular,
    ...leftoverProblemCards,
  ].slice(0, maxTotal);
}
