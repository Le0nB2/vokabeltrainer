-- CreateTable
CREATE TABLE "UserAiCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" DATETIME,
    "tokenType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserAiCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "selectedModel" TEXT NOT NULL DEFAULT 'gemini-3.6-flash',
    "activeAiProvider" TEXT NOT NULL DEFAULT 'gemini'
);
INSERT INTO "new_Settings" ("balloonPopEnabled", "id", "isSetupCompleted", "minigameIntervalMax", "minigameIntervalMin", "minigamesEnabled", "notificationsEnabled", "reactionTesterEnabled", "selectedModel", "settingsPasswordHash", "speechLanguage", "speedMatchEnabled", "wordDropEnabled", "worksheetCount") SELECT "balloonPopEnabled", "id", "isSetupCompleted", "minigameIntervalMax", "minigameIntervalMin", "minigamesEnabled", "notificationsEnabled", "reactionTesterEnabled", "selectedModel", "settingsPasswordHash", "speechLanguage", "speedMatchEnabled", "wordDropEnabled", "worksheetCount" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "UserAiCredential_userId_idx" ON "UserAiCredential"("userId");
