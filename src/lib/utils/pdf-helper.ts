import { renderToBuffer } from '@react-pdf/renderer';
import WorksheetPDF from '../../app/decks/[id]/worksheet/WorksheetPDF';
import React from 'react';
import { PDFDocument } from 'pdf-lib';

export async function getPdfPageCountFromBuffer(buffer: Uint8Array): Promise<number> {
    const pdfDoc = await PDFDocument.load(buffer);
    return pdfDoc.getPageCount();
}

export async function generateOptimizedPdf(
    worksheetId: string,
    dateStr: string,
    exercises: any,
    solutions: any,
    maxPages: number = 4,
    deckName?: string
) {
    let currentExercises = JSON.parse(JSON.stringify(exercises));
    let currentSolutions = JSON.parse(JSON.stringify(solutions));

    // React PDF renderer types require the top level element to be a Document.
    // Since WorksheetPDF returns a <Document> we can bypass TypeScript here safely
    const render = async () => {
        return renderToBuffer(
            React.createElement(WorksheetPDF, {
                worksheetId,
                dateStr,
                deckName,
                exercises: currentExercises,
                solutions: currentSolutions
            }) as any
        );
    }

    let buffer = await render();
    let pages = await getPdfPageCountFromBuffer(new Uint8Array(buffer));

    let cuts = 0;
    // 1. If multipleChoice was set to 18 and causes Page 1 to spill, trimming to 16 restores Page 1 immediately
    while (pages > maxPages && currentExercises.multipleChoice?.length > 16 && cuts < 5) {
        currentExercises.multipleChoice.splice(-2, 2);
        cuts++;

        buffer = await render();
        pages = await getPdfPageCountFromBuffer(new Uint8Array(buffer));
    }

    // 2. Trim Page 2 & 3 tasks if needed
    while (pages > maxPages && currentExercises.translateSentences?.length >= 4 && cuts < 15) {
        currentExercises.translateSentences.splice(-2, 2);
        currentSolutions.translateSolutions.splice(-2, 2);
        cuts++;

        buffer = await render();
        pages = await getPdfPageCountFromBuffer(new Uint8Array(buffer));
    }

    while (pages > maxPages && currentExercises.fillInTheBlank?.length >= 4 && cuts < 20) {
        currentExercises.fillInTheBlank.splice(-1, 1);
        currentSolutions.fillInTheBlankSolutions.splice(-1, 1);
        cuts++;

        buffer = await render();
        pages = await getPdfPageCountFromBuffer(new Uint8Array(buffer));
    }

    // 3. Last resort fallback for multipleChoice
    while (pages > maxPages && currentExercises.multipleChoice?.length > 14 && cuts < 25) {
        currentExercises.multipleChoice.splice(-2, 2);
        cuts++;

        buffer = await render();
        pages = await getPdfPageCountFromBuffer(new Uint8Array(buffer));
    }

    return {
        buffer,
        pages,
        finalExercises: currentExercises,
        finalSolutions: currentSolutions
    };
}
