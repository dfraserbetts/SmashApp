-- CreateEnum
CREATE TYPE "LimitBreakTemplateType" AS ENUM ('PLAYER', 'MYTHIC_ITEM', 'MONSTER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntentionType" ADD VALUE 'DEFENCE';
ALTER TYPE "IntentionType" ADD VALUE 'HEALING';
ALTER TYPE "IntentionType" ADD VALUE 'CLEANSE';
ALTER TYPE "IntentionType" ADD VALUE 'SUMMONING';
ALTER TYPE "IntentionType" ADD VALUE 'TRANSFORMATION';

-- CreateTable
CREATE TABLE "LimitBreakTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateType" "LimitBreakTemplateType" NOT NULL,
    "tier" "LimitBreakTier" NOT NULL,
    "thresholdPercent" INTEGER NOT NULL,
    "description" TEXT,
    "intention" "IntentionType",
    "itemType" TEXT,
    "monsterCategory" TEXT,
    "baseCostKey" TEXT,
    "baseCostParams" JSONB NOT NULL DEFAULT '{}',
    "successEffectKey" TEXT,
    "successEffectParams" JSONB NOT NULL DEFAULT '{}',
    "isPersistent" BOOLEAN NOT NULL DEFAULT false,
    "persistentStateText" TEXT,
    "endConditionText" TEXT,
    "endCostText" TEXT,
    "failForwardEnabled" BOOLEAN NOT NULL DEFAULT false,
    "failForwardEffectKey" TEXT,
    "failForwardEffectParams" JSONB NOT NULL DEFAULT '{}',
    "failForwardCostAKey" TEXT,
    "failForwardCostBKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LimitBreakTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LimitBreakTemplate_templateType_tier_idx" ON "LimitBreakTemplate"("templateType", "tier");

-- CreateIndex
CREATE INDEX "LimitBreakTemplate_intention_idx" ON "LimitBreakTemplate"("intention");

-- CreateIndex
CREATE INDEX "LimitBreakTemplate_itemType_idx" ON "LimitBreakTemplate"("itemType");
