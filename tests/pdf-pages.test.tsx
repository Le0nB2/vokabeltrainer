import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { generateOptimizedPdf, getPdfPageCountFromBuffer } from '../src/lib/utils/pdf-helper';
import WorksheetPDF from '../src/app/decks/[id]/worksheet/WorksheetPDF';

function buildDataset(opts: {
  mcCount: number;
  wordBoxCount: number;
  transCount: number;
  fibCount: number;
  longSentences?: boolean;
}) {
  const { mcCount, wordBoxCount, transCount, fibCount, longSentences } = opts;

  const exercises = {
    multipleChoice: Array.from({ length: mcCount }).map((_, i) => ({
      question: `Question ${i + 1}: Which sentence is correct?`,
      options: ['She goes to school.', 'She go to school.', 'She going to school.'],
      correctIndex: 0,
    })),
    fillInTheBlank: Array.from({ length: fibCount }).map((_, i) => ({
      sentenceBeforeGap: `Sentence ${i + 1} before`,
      sentenceAfterGap: `and after the gap.`,
      germanHint: 'Hinweis',
      answer: longSentences ? `vocabulary-word-${i + 1}` : `word${i + 1}`,
    })),
    wordBoxWords: Array.from({ length: wordBoxCount }).map((_, i) => `word${i + 1}`),
    wordBoxSentences: Array.from({ length: wordBoxCount }).map((_, i) => ({
      sentenceBeforeGap: `Wordbox sentence ${i + 1} before`,
      sentenceAfterGap: `after.`,
      answer: longSentences ? `expression-${i + 1}` : `box${i + 1}`,
    })),
    translateSentences: Array.from({ length: transCount }).map((_, i) => ({
      germanSentence: `Dies ist ein deutscher Satz Nummer ${i + 1}.`,
      englishFirstLetter: 'T',
      answer: longSentences
        ? `This is a longer English sentence number ${i + 1} today.`
        : `This is sentence ${i + 1}.`,
    })),
  };

  const solutions = {
    fillInTheBlankSolutions: exercises.fillInTheBlank.map((x) => x.answer),
    wordBoxSolutions: exercises.wordBoxSentences.map((x) => x.answer),
    translateSolutions: exercises.translateSentences.map((x) => x.answer),
  };

  return { exercises, solutions };
}

describe('WorksheetPDF Solution Sheet Layout & 4 Real PDF Tests', () => {
  it('Test 1: renders full standard worksheet (18 MC, 16 WB, 26 Trans, 24 FIB) in 4 pages', async () => {
    const { exercises, solutions } = buildDataset({
      mcCount: 18,
      wordBoxCount: 16,
      transCount: 26,
      fibCount: 24,
    });

    const result = await generateOptimizedPdf('T001', '24.11.2026', exercises, solutions, 4, 'Unit 1');
    expect(result.pages).toBe(4);
    expect(result.finalSolutions.wordBoxSolutions).toHaveLength(16);
    expect(result.finalSolutions.fillInTheBlankSolutions).toHaveLength(24);
  }, 60000);

  it('Test 2: renders 4 pages even with longer English translation sentences and answers', async () => {
    const { exercises, solutions } = buildDataset({
      mcCount: 16,
      wordBoxCount: 16,
      transCount: 26,
      fibCount: 24,
      longSentences: true,
    });

    const result = await generateOptimizedPdf('T002', '24.11.2026', exercises, solutions, 4, 'Unit 2');
    expect(result.pages).toBe(4);
  }, 60000);

  it('Test 3: renders 4 pages without trimming for compact/medium exercise counts', async () => {
    const { exercises, solutions } = buildDataset({
      mcCount: 16,
      wordBoxCount: 12,
      transCount: 20,
      fibCount: 20,
    });

    const buffer = await renderToBuffer(
      React.createElement(WorksheetPDF, {
        worksheetId: 'T003',
        dateStr: '24.11.2026',
        deckName: 'Unit 3',
        exercises,
        solutions,
      }) as any
    );

    const pages = await getPdfPageCountFromBuffer(new Uint8Array(buffer));
    expect(pages).toBe(4);
  }, 60000);

  it('Test 4: orders solution sections 1 -> 2 (1-col) -> 3 (2-col) -> 4 (1-col) and renders 4 pages', async () => {
    const { exercises, solutions } = buildDataset({
      mcCount: 16,
      wordBoxCount: 14,
      transCount: 22,
      fibCount: 22,
    });

    const element = React.createElement(WorksheetPDF, {
      worksheetId: 'T004',
      dateStr: '24.11.2026',
      deckName: 'Unit 4',
      exercises,
      solutions,
    });

    // Verify section order and layout styles on the solution page
    const doc = (element.type as any)(element.props);
    const pages = React.Children.toArray(doc.props.children) as any[];
    expect(pages).toHaveLength(2);

    const solutionPage = pages[1];
    const solutionChildren = React.Children.toArray(solutionPage.props.children) as any[];
    // Children: [pageIdDate, solutionHeader, section1, section2, section3, section4]
    const sections = solutionChildren.slice(2);
    expect(sections).toHaveLength(4);

    const titles = sections.map((sec: any) => {
      const secChildren = React.Children.toArray(sec.props.children) as any[];
      return secChildren[0].props.children;
    });
    expect(titles).toEqual([
      '1. Multiple Choice',
      '2. Words in a box',
      '3. Translation challenge',
      '4. Fill in the blanks',
    ]);

    // Section 2 (Words in a box) -> singleColList (einzeilig)
    const sec2List = React.Children.toArray(sections[1].props.children)[1] as any;
    expect(sec2List.props.style).toEqual({ flexDirection: 'column' });

    // Section 3 (Translation challenge) -> twoColList (zweispaltig)
    const sec3List = React.Children.toArray(sections[2].props.children)[1] as any;
    expect(sec3List.props.style).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });

    // Section 4 (Fill in the blanks) -> singleColList (einzeilig)
    const sec4List = React.Children.toArray(sections[3].props.children)[1] as any;
    expect(sec4List.props.style).toEqual({ flexDirection: 'column' });

    // Also render real PDF buffer and verify 4 pages
    const buffer = await renderToBuffer(element as any);
    const pageCount = await getPdfPageCountFromBuffer(new Uint8Array(buffer));
    expect(pageCount).toBe(4);
  }, 60000);
});
