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

// Englische Kurzformen und Langformen normalisieren
const CONTRACTIONS: [RegExp, string][] = [
  [/\b(you)['’]?re\b/gi, 'you are'],
  [/\b(they)['’]?re\b/gi, 'they are'],
  [/\b(we)['’]?re\b/gi, 'we are'],
  [/\b(i)['’]?m\b/gi, 'i am'],
  [/\b(she)['’]?s\b/gi, 'she is'],
  [/\b(he)['’]?s\b/gi, 'he is'],
  [/\b(it)['’]?s\b/gi, 'it is'],
  [/\b(that)['’]?s\b/gi, 'that is'],
  [/\b(what)['’]?s\b/gi, 'what is'],
  [/\b(who)['’]?s\b/gi, 'who is'],
  [/\b(there)['’]?s\b/gi, 'there is'],
  [/\b(isn)['’]?t\b/gi, 'is not'],
  [/\b(aren)['’]?t\b/gi, 'are not'],
  [/\b(wasn)['’]?t\b/gi, 'was not'],
  [/\b(weren)['’]?t\b/gi, 'were not'],
  [/\b(don)['’]?t\b/gi, 'do not'],
  [/\b(doesn)['’]?t\b/gi, 'does not'],
  [/\b(didn)['’]?t\b/gi, 'did not'],
  [/\b(can)['’]?t\b/gi, 'cannot'],
  [/\b(won)['’]?t\b/gi, 'will not'],
  [/\b(haven)['’]?t\b/gi, 'have not'],
  [/\b(hasn)['’]?t\b/gi, 'has not'],
  [/\b(hadn)['’]?t\b/gi, 'had not'],
  [/\b(let)['’]?s\b/gi, 'let us'],
];

function expandContractions(str: string): string {
  let s = str;
  for (const [regex, repl] of CONTRACTIONS) {
    s = s.replace(regex, repl);
  }
  return s;
}

// Grundbereinigung für Textvergleich
function cleanString(str: string): string {
  let s = expandContractions(str.toLowerCase());
  s = s.replace(/ß/g, 'ss');
  s = s.replace(/[.,/#!$%^&*;:{}=\-_`~()?"'„“‚‘…\\]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// Führende deutsche und englische Artikel sowie "to" bei Verben entfernen
function stripLeadingArticles(str: string): string {
  return str
    .replace(/^(der|die|das|ein|eine|einen|einem|einer)\s+/i, '')
    .replace(/^(to|a|an|the)\s+/i, '')
    .trim();
}

// Aus einer Vorgabe (z.B. "oben; nach oben (im Haus)") alle didaktisch zulässigen Varianten extrahieren
export function extractAnswerVariants(rawTarget: string): string[] {
  const candidates = new Set<string>();

  // 1. Variante ohne Klammerinhalte (z. B. "(im Haus)" entfällt)
  const withoutBrackets = rawTarget.replace(/\([^()]*\)/g, '').replace(/\[[^\[\]]*\]/g, '');

  // 2. Variante mit Klammerinhalten, aber ohne Klammerzeichen (z. B. "(Mobil-)Telefon" -> "MobilTelefon")
  const withParenContent = rawTarget
    .replace(/\(([a-zA-ZäöüÄÖÜß]+)-\)/g, '$1') // z.B. (Mobil-)Telefon -> MobilTelefon
    .replace(/[()[\]]/g, '');

  const textVersions = [withoutBrackets, withParenContent];

  for (const text of textVersions) {
    const withoutEllipsis = text.replace(/\.{2,}/g, ' ').replace(/…/g, ' ');

    // Kurzantworten wie "Yes, I am." oder "Ja, das bin ich." nicht an Kommas zerschlagen
    const isShortAnswer =
      /^(yes|no),\s*(i am|he is|she is|they are|we are|it is)/i.test(withoutEllipsis.trim()) ||
      /^(ja|nein),\s*(das bin ich|ich bin)/i.test(withoutEllipsis.trim());

    const parts = isShortAnswer
      ? [withoutEllipsis]
      : withoutEllipsis.split(/[;/]|\boder\b|,/);

    for (const p of parts) {
      const cleaned = cleanString(p);
      if (cleaned.length > 0) {
        candidates.add(cleaned);
        const noArt = stripLeadingArticles(cleaned);
        if (noArt.length > 0) {
          candidates.add(noArt);
        }
      }
    }
  }

  // Vollständiger bereinigter Zielstring als Notfallvariante
  const fullCleaned = cleanString(withoutBrackets);
  if (fullCleaned.length > 0) candidates.add(fullCleaned);

  return Array.from(candidates);
}

// Prüfung mit didaktischer Staffelung & Synonym-Unterstützung
export function evaluateAnswer(input: string, correct: string) {
  const cleanedInput = cleanString(input);
  const strippedInput = stripLeadingArticles(cleanedInput);
  const variants = extractAnswerVariants(correct);

  let bestStatus: 'CORRECT' | 'TYPO' | 'WRONG' = 'WRONG';
  let matchedVariant: string | null = null;

  for (const v of variants) {
    for (const inp of [cleanedInput, strippedInput]) {
      const dist = damerauLevenshtein(inp, v);
      const targetLen = v.length;
      let maxAllowed = 0;
      if (targetLen >= 5 && targetLen <= 8) maxAllowed = 1;
      else if (targetLen >= 9) maxAllowed = 2;

      if (dist === 0) {
        return {
          status: 'CORRECT' as const,
          message: 'Perfekt!',
          matched: v,
        };
      } else if (dist <= maxAllowed) {
        bestStatus = 'TYPO';
        matchedVariant = v;
      }
    }
  }

  if (bestStatus === 'TYPO') {
    return {
      status: 'TYPO' as const,
      message: `Tippfehler beachtet: Richtig ist "${correct}".`,
      matched: matchedVariant || undefined,
    };
  }

  return {
    status: 'WRONG' as const,
    message: `Falsch. Richtige Antwort: "${correct}".`,
  };
}
