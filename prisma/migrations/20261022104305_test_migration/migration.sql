-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "minigamesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "minigameIntervalMin" INTEGER NOT NULL DEFAULT 50,
    "minigameIntervalMax" INTEGER NOT NULL DEFAULT 75,
    "speedMatchEnabled" BOOLEAN NOT NULL DEFAULT true,
    "balloonPopEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reactionTesterEnabled" BOOLEAN NOT NULL DEFAULT true,
    "wordDropEnabled" BOOLEAN NOT NULL DEFAULT true,
    "worksheetCount" INTEGER NOT NULL DEFAULT 0,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "speechLanguage" TEXT NOT NULL DEFAULT 'en-GB',
    "selectedModel" TEXT NOT NULL DEFAULT 'gemini-3.6-flash'
);
INSERT INTO "new_Settings" ("balloonPopEnabled", "id", "minigameIntervalMax", "minigameIntervalMin", "minigamesEnabled", "notificationsEnabled", "reactionTesterEnabled", "selectedModel", "speechLanguage", "speedMatchEnabled", "wordDropEnabled", "worksheetCount") SELECT "balloonPopEnabled", "id", "minigameIntervalMax", "minigameIntervalMin", "minigamesEnabled", "notificationsEnabled", "reactionTesterEnabled", "selectedModel", "speechLanguage", "speedMatchEnabled", "wordDropEnabled", "worksheetCount" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
