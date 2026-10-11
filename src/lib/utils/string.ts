// Damerau-Levenshtein-Distanz (inklusive Buchstabendreher)
export function damerauLevenshtein(a: string, b: string): number {
  const source = a.trim().toLowerCase();
  const target = b.trim().toLowerCase();

  if (source === target) return 0;
  if (!source.length) return target.length;
  if (!target.length) return source.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= source.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= target.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= source.length; i++) {
    for (let j = 1; j <= target.length; j++) {
      const cost = source[i - 1] === target[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // Löschen
        matrix[i][j - 1] + 1, // Einfügen
        matrix[i - 1][j - 1] + cost // Ersetzen
      );

      // Vertauschung benachbarter Buchstaben prüfen
      if (
        i > 1 &&
        j > 1 &&
        source[i - 1] === target[j - 2] &&
        source[i - 2] === target[j - 1]
      ) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + cost);
      }
    }
  }

  return matrix[source.length][target.length];
}

// Prüfung mit didaktischer Staffelung
export function evaluateAnswer(input: string, correct: string) {
  // Zuerst Text in Klammern entfernen (z.B. "(to)", "[sth]"), dann Sonderzeichen
  const removeBrackets = (str: string) => str.replace(/\([^()]*\)/g, '').replace(/\[[^\[\]]*\]/g, '');

  const normalizedInput = removeBrackets(input.toLowerCase()).replace(/[.,/#!$%^&*;:{}=\-_\`~()]/g, "").replace(/\s{2,}/g, ' ').trim();
  const normalizedCorrect = removeBrackets(correct.toLowerCase()).replace(/[.,/#!$%^&*;:{}=\-_\`~()]/g, "").replace(/\s{2,}/g, ' ').trim();

  const dist = damerauLevenshtein(normalizedInput, normalizedCorrect);
  const targetLength = normalizedCorrect.length;

  let maxAllowed = 0;
  if (targetLength >= 5 && targetLength <= 8) maxAllowed = 1;
  else if (targetLength >= 9) maxAllowed = 2;

  if (dist === 0) {
    return { status: "CORRECT", message: "Perfekt!" };
  } else if (dist <= maxAllowed) {
    return {
      status: "TYPO",
      message: `Tippfehler beachtet: Richtig ist "${correct}".`
    };
  } else {
    return { status: "WRONG", message: `Falsch. Richtige Antwort: "${correct}".` };
  }
}
