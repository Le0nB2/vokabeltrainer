-- AlterTable
ALTER TABLE "Card" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "Deck" ADD COLUMN "targetLanguage" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN "sourceLanguage" TEXT NOT NULL DEFAULT 'de';
