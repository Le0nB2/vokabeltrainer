-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "isSetupCompleted" BOOLEAN NOT NULL DEFAULT false,
    "settingsPasswordHash" TEXT,
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
    "selectedModel" TEXT NOT NULL DEFAULT 'gemini-4-hydrogen',
    "openRouterModel" TEXT NOT NULL DEFAULT 'openrouter/free',
    "openAiModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "activeAiProvider" TEXT NOT NULL DEFAULT 'gemini'
);
INSERT INTO "new_Settings" ("activeAiProvider", "balloonPopEnabled", "id", "isSetupCompleted", "minigameIntervalMax", "minigameIntervalMin", "minigamesEnabled", "notificationsEnabled", "openAiModel", "openRouterModel", "reactionTesterEnabled", "selectedModel", "settingsPasswordHash", "speechLanguage", "speedMatchEnabled", "wordDropEnabled", "worksheetCount") SELECT "activeAiProvider", "balloonPopEnabled", "id", "isSetupCompleted", "minigameIntervalMax", "minigameIntervalMin", "minigamesEnabled", "notificationsEnabled", "openAiModel", "openRouterModel", "reactionTesterEnabled", "selectedModel", "settingsPasswordHash", "speechLanguage", "speedMatchEnabled", "wordDropEnabled", "worksheetCount" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Update existing settings that are still on previous default flash models to gemini-4-hydrogen
UPDATE "Settings" SET "selectedModel" = 'gemini-4-hydrogen' WHERE "selectedModel" IN ('gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash');

