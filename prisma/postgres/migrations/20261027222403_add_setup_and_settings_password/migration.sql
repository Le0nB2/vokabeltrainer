-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "isSetupCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "settingsPasswordHash" TEXT;
