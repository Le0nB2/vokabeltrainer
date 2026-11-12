-- AlterTable
ALTER TABLE "Settings" ALTER COLUMN "selectedModel" SET DEFAULT 'gemini-4-hydrogen';

-- Update existing default settings if still on previous default flash models
UPDATE "Settings" SET "selectedModel" = 'gemini-4-hydrogen' WHERE "selectedModel" IN ('gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash');
