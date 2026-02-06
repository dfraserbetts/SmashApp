-- CreateEnum
CREATE TYPE "AbilitySourceType" AS ENUM ('CHARACTER_POWER', 'MYTHIC_ITEM_ABILITY', 'MONSTER_ABILITY');

-- CreateEnum
CREATE TYPE "IntentionType" AS ENUM ('ATTACK', 'CONTROL', 'MOVEMENT', 'SUPPORT', 'AUGMENT', 'DEBUFF');

-- CreateEnum
CREATE TYPE "LimitBreakTier" AS ENUM ('PUSH', 'BREAK', 'TRANSCEND');

-- CreateEnum
CREATE TYPE "LimitBreakActorType" AS ENUM ('CHARACTER', 'MONSTER');

-- CreateTable
CREATE TABLE "Ability" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" "AbilitySourceType" NOT NULL,
    "intention" "IntentionType" NOT NULL,
    "diceCount" INTEGER NOT NULL,
    "potency" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LimitBreakEffect" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "intentionGate" "IntentionType",
    "params" JSONB NOT NULL DEFAULT '{}',
    "rulesText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LimitBreakEffect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LimitBreakConsequence" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "rulesText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LimitBreakConsequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LimitBreakProfile" (
    "id" TEXT NOT NULL,
    "abilityId" TEXT NOT NULL,
    "tier" "LimitBreakTier" NOT NULL,
    "name" TEXT NOT NULL,
    "thresholdPercent" INTEGER NOT NULL,
    "baseConsequenceId" TEXT NOT NULL,
    "successEffectId" TEXT NOT NULL,
    "failForwardEffectId" TEXT,
    "failForwardCostAId" TEXT,
    "failForwardCostBId" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LimitBreakProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbilityLimitBreakUsage" (
    "id" TEXT NOT NULL,
    "actorType" "LimitBreakActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "abilityId" TEXT NOT NULL,
    "usedAtLevel" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbilityLimitBreakUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ability_sourceType_idx" ON "Ability"("sourceType");

-- CreateIndex
CREATE INDEX "Ability_intention_idx" ON "Ability"("intention");

-- CreateIndex
CREATE UNIQUE INDEX "LimitBreakEffect_key_key" ON "LimitBreakEffect"("key");

-- CreateIndex
CREATE UNIQUE INDEX "LimitBreakConsequence_key_key" ON "LimitBreakConsequence"("key");

-- CreateIndex
CREATE INDEX "LimitBreakProfile_tier_idx" ON "LimitBreakProfile"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "LimitBreakProfile_abilityId_tier_key" ON "LimitBreakProfile"("abilityId", "tier");

-- CreateIndex
CREATE INDEX "AbilityLimitBreakUsage_actorType_actorId_idx" ON "AbilityLimitBreakUsage"("actorType", "actorId");

-- CreateIndex
CREATE INDEX "AbilityLimitBreakUsage_abilityId_idx" ON "AbilityLimitBreakUsage"("abilityId");

-- CreateIndex
CREATE UNIQUE INDEX "AbilityLimitBreakUsage_actorType_actorId_abilityId_usedAtLe_key" ON "AbilityLimitBreakUsage"("actorType", "actorId", "abilityId", "usedAtLevel");

-- AddForeignKey
ALTER TABLE "LimitBreakProfile" ADD CONSTRAINT "LimitBreakProfile_abilityId_fkey" FOREIGN KEY ("abilityId") REFERENCES "Ability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LimitBreakProfile" ADD CONSTRAINT "LimitBreakProfile_baseConsequenceId_fkey" FOREIGN KEY ("baseConsequenceId") REFERENCES "LimitBreakConsequence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LimitBreakProfile" ADD CONSTRAINT "LimitBreakProfile_successEffectId_fkey" FOREIGN KEY ("successEffectId") REFERENCES "LimitBreakEffect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LimitBreakProfile" ADD CONSTRAINT "LimitBreakProfile_failForwardEffectId_fkey" FOREIGN KEY ("failForwardEffectId") REFERENCES "LimitBreakEffect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LimitBreakProfile" ADD CONSTRAINT "LimitBreakProfile_failForwardCostAId_fkey" FOREIGN KEY ("failForwardCostAId") REFERENCES "LimitBreakConsequence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LimitBreakProfile" ADD CONSTRAINT "LimitBreakProfile_failForwardCostBId_fkey" FOREIGN KEY ("failForwardCostBId") REFERENCES "LimitBreakConsequence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbilityLimitBreakUsage" ADD CONSTRAINT "AbilityLimitBreakUsage_abilityId_fkey" FOREIGN KEY ("abilityId") REFERENCES "Ability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
