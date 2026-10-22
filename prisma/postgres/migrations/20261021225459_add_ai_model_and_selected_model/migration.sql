-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "selectedModel" TEXT NOT NULL DEFAULT 'gemini-3.5-flash-lite';

-- CreateTable
CREATE TABLE "AiModel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiModel_pkey" PRIMARY KEY ("id")
);
