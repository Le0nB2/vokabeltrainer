-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "notes" TEXT,
    "mnemonic" TEXT,
    "contextSentence" TEXT,
    "easeFactor" REAL NOT NULL DEFAULT 2.5,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "box" INTEGER NOT NULL DEFAULT 1,
    "consecutiveCorrect" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewed" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "gapText" TEXT,
    CONSTRAINT "Card_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Card" ("back", "box", "consecutiveCorrect", "contextSentence", "createdAt", "deckId", "dueDate", "easeFactor", "front", "gapText", "id", "lapses", "lastReviewed", "mnemonic", "notes", "updatedAt") SELECT "back", "box", "consecutiveCorrect", "contextSentence", "createdAt", "deckId", "dueDate", "easeFactor", "front", "gapText", "id", "lapses", "lastReviewed", "mnemonic", "notes", "updatedAt" FROM "Card";
DROP TABLE "Card";
ALTER TABLE "new_Card" RENAME TO "Card";
CREATE TABLE "new_Deck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetLanguage" TEXT NOT NULL DEFAULT 'en',
    "sourceLanguage" TEXT NOT NULL DEFAULT 'de',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastResultCorrect" INTEGER,
    "lastResultIncorrect" INTEGER,
    CONSTRAINT "Deck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Deck" ("createdAt", "description", "id", "lastResultCorrect", "lastResultIncorrect", "title", "updatedAt", "userId") SELECT "createdAt", "description", "id", "lastResultCorrect", "lastResultIncorrect", "title", "updatedAt", "userId" FROM "Deck";
DROP TABLE "Deck";
ALTER TABLE "new_Deck" RENAME TO "Deck";
CREATE INDEX "Deck_userId_idx" ON "Deck"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
