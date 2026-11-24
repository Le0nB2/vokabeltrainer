import { describe, it, expect } from "vitest";
import { selectWorksheetCards, WorksheetSelectableCard } from "@/lib/utils/worksheet-cards";

function makeCard(
  id: string,
  overrides: Partial<WorksheetSelectableCard> = {}
): WorksheetSelectableCard {
  return {
    id,
    dueDate: new Date("2026-11-24T00:00:00Z"),
    lapses: 0,
    reviewLogs: [],
    ...overrides,
  };
}

describe("selectWorksheetCards", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  const past = new Date("2026-11-23T12:00:00Z");
  const future = new Date("2026-11-25T12:00:00Z");

  it("caps problem cards at 1/4 of total selected cards when enough regular cards exist", () => {
    const problemCards = Array.from({ length: 15 }, (_, i) =>
      makeCard(`p-${i}`, {
        dueDate: past,
        lapses: 3,
        reviewLogs: [{ isCorrect: false }],
      })
    );
    const regularCards = Array.from({ length: 30 }, (_, i) =>
      makeCard(`r-${i}`, {
        dueDate: past,
        lapses: 0,
        reviewLogs: [{ isCorrect: true }],
      })
    );

    const selected = selectWorksheetCards([...problemCards, ...regularCards], 20, now);
    expect(selected).toHaveLength(20);

    const selectedProblemCount = selected.filter((c) => c.id.startsWith("p-")).length;
    expect(selectedProblemCount).toBe(5); // 1/4 of 20
  });

  it("prioritizes recently incorrect cards and higher lapses among problem cards", () => {
    const cards: WorksheetSelectableCard[] = [
      makeCard("lapses-2", { dueDate: future, lapses: 2, reviewLogs: [{ isCorrect: true }] }),
      makeCard("lapses-5", { dueDate: future, lapses: 5, reviewLogs: [{ isCorrect: true }] }),
      makeCard("wrong-1", { dueDate: future, lapses: 1, reviewLogs: [{ isCorrect: false }] }),
      makeCard("wrong-4", { dueDate: future, lapses: 4, reviewLogs: [{ isCorrect: false }] }),
      ...Array.from({ length: 12 }, (_, i) =>
        makeCard(`reg-${i}`, { dueDate: past, lapses: 0, reviewLogs: [{ isCorrect: true }] })
      ),
    ];

    // 16 cards total -> max 4 problem cards; let's request 8 cards -> max 2 problem cards
    const selected = selectWorksheetCards(cards, 8, now);
    expect(selected).toHaveLength(8);
    expect(selected[0].id).toBe("wrong-4");
    expect(selected[1].id).toBe("wrong-1");
  });

  it("fills remaining slots with due regular cards before non-due regular cards", () => {
    const cards: WorksheetSelectableCard[] = [
      makeCard("wrong", { dueDate: past, reviewLogs: [{ isCorrect: false }] }),
      makeCard("due-1", { dueDate: past }),
      makeCard("due-2", { dueDate: past }),
      makeCard("future-1", { dueDate: future }),
      makeCard("future-2", { dueDate: future }),
      makeCard("future-3", { dueDate: future }),
    ];

    // 6 total, request 4 -> max 1 problem card, 2 due regular, 1 future regular
    const selected = selectWorksheetCards(cards, 4, now);
    expect(selected).toHaveLength(4);
    const ids = selected.map((c) => c.id);
    expect(ids).toContain("wrong");
    expect(ids).toContain("due-1");
    expect(ids).toContain("due-2");
    expect(ids.filter((id) => id.startsWith("future-"))).toHaveLength(1);
  });

  it("falls back to leftover problem cards if regular cards are insufficient", () => {
    const problemCards = Array.from({ length: 8 }, (_, i) =>
      makeCard(`p-${i}`, { dueDate: past, reviewLogs: [{ isCorrect: false }] })
    );
    const regularCards = [makeCard("r-0", { dueDate: past })];

    const selected = selectWorksheetCards([...problemCards, ...regularCards], 8, now);
    expect(selected).toHaveLength(8);
    expect(selected.some((c) => c.id === "r-0")).toBe(true);
  });

  it("handles cards without optional lapses or reviewLogs fields", () => {
    const cards = [
      { id: "c1", dueDate: past },
      { id: "c2", dueDate: past },
      { id: "c3", dueDate: future },
      { id: "c4", dueDate: future },
      { id: "c5", dueDate: past },
    ];

    const selected = selectWorksheetCards(cards, 60, now);
    expect(selected).toHaveLength(5);
  });
});
