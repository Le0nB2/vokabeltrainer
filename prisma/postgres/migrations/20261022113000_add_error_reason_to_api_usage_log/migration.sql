-- AlterTable
ALTER TABLE "ApiUsageLog" ADD COLUMN "errorReason" TEXT;

-- AlterTable
ALTER TABLE "Settings" ALTER COLUMN "selectedModel" SET DEFAULT 'gemini-3.6-flash';

-- Update existing default settings if still on 3.5
UPDATE "Settings" SET "selectedModel" = 'gemini-3.6-flash' WHERE "selectedModel" = 'gemini-3.5-flash-lite';
