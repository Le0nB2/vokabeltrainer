-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "openRouterModel" TEXT NOT NULL DEFAULT 'openrouter/free';
ALTER TABLE "Settings" ADD COLUMN "openAiModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini';

-- AlterTable
ALTER TABLE "AiModel" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'gemini';
