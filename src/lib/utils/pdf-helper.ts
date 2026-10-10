import { renderToBuffer } from '@react-pdf/renderer';
import WorksheetPDF from '../../app/decks/[id]/worksheet/WorksheetPDF';
import React from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

export async function getPdfPageCountFromBuffer(buffer: Uint8Array): Promise<number> {
    const pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
    return pdfDoc.numPages;
}

export async function generateOptimizedPdf(
    worksheetId: string,
    dateStr: string,
    exercises: any,
    solutions: any,
    maxPages: number = 4
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
                exercises: currentExercises,
                solutions: currentSolutions
            }) as any
        );
    }

    let buffer = await render();
    let pages = await getPdfPageCountFromBuffer(new Uint8Array(buffer));

    let cuts = 0;
    while (pages > maxPages && currentExercises.translateSentences.length >= 2 && cuts < 10) {
        currentExercises.translateSentences.splice(-2, 2);
        currentSolutions.translateSolutions.splice(-2, 2);
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
