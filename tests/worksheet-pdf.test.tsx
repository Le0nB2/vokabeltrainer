import { describe, it, expect } from "vitest";
import React from "react";
import WorksheetPDF from "@/app/decks/[id]/worksheet/WorksheetPDF";

describe("WorksheetPDF Deck Name Header", () => {
  const dummyExercises = {
    multipleChoice: [
      {
        question: "What is an apple?",
        options: ["Apfel", "Birne", "Banane"],
        correctIndex: 0,
      },
    ],
    fillInTheBlank: [],
    wordBoxWords: [],
    wordBoxSentences: [],
    translateSentences: [],
  };

  const dummySolutions = {
    fillInTheBlankSolutions: [],
    wordBoxSolutions: [],
    translateSolutions: [],
  };

  it("renders header text with deck name before ID when deckName is provided", () => {
    const element = React.createElement(WorksheetPDF, {
      exercises: dummyExercises,
      solutions: dummySolutions,
      worksheetId: "A001",
      dateStr: "01.11.2026",
      deckName: "Englisch Klasse 6",
    });

    // Inspect the JSX element tree
    const doc = (element.type as any)(element.props);
    expect(doc.props.title).toBe("Englisch Klasse 6 - A001");

    const pages = React.Children.toArray(doc.props.children) as any[];
    expect(pages.length).toBe(2); // Page 1 and Page 4 (solutionPage)

    // Check Page 1 header text
    const page1 = pages[0];
    const page1Children = React.Children.toArray(page1.props.children) as any[];
    const headerText1 = page1Children[0];
    expect(headerText1.props.children).toBe("Englisch Klasse 6 - ID: A001 - 01.11.2026");

    // Check Page 4 header text
    const page4 = pages[1];
    const page4Children = React.Children.toArray(page4.props.children) as any[];
    const headerText4 = page4Children[0];
    expect(headerText4.props.children).toBe("Englisch Klasse 6 - ID: A001 - 01.11.2026");
  });

  it("renders header text without deck name prefix when deckName is missing or empty", () => {
    const element = React.createElement(WorksheetPDF, {
      exercises: dummyExercises,
      solutions: dummySolutions,
      worksheetId: "B042",
      dateStr: "15.12.2026",
    });

    const doc = (element.type as any)(element.props);
    expect(doc.props.title).toBe("B042");

    const pages = React.Children.toArray(doc.props.children) as any[];
    const page1 = pages[0];
    const page1Children = React.Children.toArray(page1.props.children) as any[];
    const headerText1 = page1Children[0];
    expect(headerText1.props.children).toBe("ID: B042 - 15.12.2026");

    const page4 = pages[1];
    const page4Children = React.Children.toArray(page4.props.children) as any[];
    const headerText4 = page4Children[0];
    expect(headerText4.props.children).toBe("ID: B042 - 15.12.2026");
  });

  it("trims whitespace from deckName if present", () => {
    const element = React.createElement(WorksheetPDF, {
      exercises: dummyExercises,
      solutions: dummySolutions,
      worksheetId: "C100",
      dateStr: "02.02.2027",
      deckName: "   Französisch Vokabeln   ",
    });

    const doc = (element.type as any)(element.props);
    expect(doc.props.title).toBe("Französisch Vokabeln - C100");

    const pages = React.Children.toArray(doc.props.children) as any[];
    const page1 = pages[0];
    const page1Children = React.Children.toArray(page1.props.children) as any[];
    const headerText1 = page1Children[0];
    expect(headerText1.props.children).toBe("Französisch Vokabeln - ID: C100 - 02.02.2027");
  });
});
