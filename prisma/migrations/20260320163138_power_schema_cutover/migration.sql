/*
  Warnings:

  - The `intentionGate` column on the `LimitBreakEffect` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `abilityId` on the `LimitBreakProfile` table. All the data in the column will be lost.
  - The `intention` column on the `LimitBreakTemplate` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `Ability` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AbilityLimitBreakUsage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MonsterPower` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MonsterPowerIntention` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[powerId,tier]` on the table `LimitBreakProfile` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `powerId` to the `LimitBreakProfile` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PowerSourceType" AS ENUM ('CHARACTER_POWER', 'MYTHIC_ITEM_POWER', 'MONSTER_POWER');

-- CreateEnum
CREATE TYPE "PowerIntention" AS ENUM ('ATTACK', 'DEFENCE', 'HEALING', 'CLEANSE', 'CONTROL', 'MOVEMENT', 'SUPPORT', 'AUGMENT', 'DEBUFF', 'SUMMONING', 'TRANSFORMATION');

-- CreateEnum
CREATE TYPE "PowerStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DescriptorChassisType" AS ENUM ('IMMEDIATE', 'FIELD', 'TRIGGER', 'ATTACHED', 'COUNTER', 'RESERVE', 'CONVERSION', 'SEQUENCE');

-- CreateEnum
CREATE TYPE "PacketHostility" AS ENUM ('NON_HOSTILE', 'HOSTILE');

-- CreateEnum
CREATE TYPE "PrimaryDefenceGateResult" AS ENUM ('NONE', 'DODGE', 'PROTECTION', 'DODGE_OR_PROTECTION', 'RESIST');

-- CreateEnum
CREATE TYPE "ProtectionChannel" AS ENUM ('PHYSICAL', 'MENTAL');

-- CreateEnum
CREATE TYPE "ResolutionOrigin" AS ENUM ('CASTER', 'PRIMARY_TARGET', 'ATTACHED_HOST', 'FIELD_ORIGIN', 'PACKET_LOCAL');

-- CreateEnum
CREATE TYPE "HostileEntryPattern" AS ENUM ('DIRECT', 'ON_ATTACH', 'ON_PAYLOAD');

-- CreateEnum
CREATE TYPE "GateResolutionSource" AS ENUM ('INFERRED', 'EXPLICIT');

-- CreateEnum
CREATE TYPE "PowerLifespanType" AS ENUM ('NONE', 'TURNS', 'PASSIVE');

-- CreateEnum
CREATE TYPE "EffectTimingType" AS ENUM ('ON_CAST', 'ON_HIT', 'ON_TRIGGER', 'START_OF_TURN', 'END_OF_TURN', 'ON_EXPIRY');

-- CreateEnum
CREATE TYPE "EffectDurationType" AS ENUM ('INSTANT', 'UNTIL_TARGET_NEXT_TURN', 'TURNS', 'PASSIVE');

-- CreateEnum
CREATE TYPE "WoundChannel" AS ENUM ('PHYSICAL', 'MENTAL');

-- DropForeignKey
ALTER TABLE "AbilityLimitBreakUsage" DROP CONSTRAINT "AbilityLimitBreakUsage_abilityId_fkey";

-- DropForeignKey
ALTER TABLE "LimitBreakProfile" DROP CONSTRAINT "LimitBreakProfile_abilityId_fkey";

-- DropForeignKey
ALTER TABLE "MonsterPower" DROP CONSTRAINT "MonsterPower_monsterId_fkey";

-- DropForeignKey
ALTER TABLE "MonsterPowerIntention" DROP CONSTRAINT "MonsterPowerIntention_powerId_fkey";

-- DropIndex
DROP INDEX "LimitBreakProfile_abilityId_tier_key";

-- AlterTable
ALTER TABLE "LimitBreakEffect" DROP COLUMN "intentionGate",
ADD COLUMN     "intentionGate" "PowerIntention";

-- AlterTable
ALTER TABLE "LimitBreakProfile" DROP COLUMN "abilityId",
ADD COLUMN     "powerId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "LimitBreakTemplate" DROP COLUMN "intention",
ADD COLUMN     "intention" "PowerIntention";

-- DropTable
DROP TABLE "Ability";

-- DropTable
DROP TABLE "AbilityLimitBreakUsage";

-- DropTable
DROP TABLE "MonsterPower";

-- DropTable
DROP TABLE "MonsterPowerIntention";

-- DropEnum
DROP TYPE "AbilitySourceType";

-- DropEnum
DROP TYPE "IntentionType";

-- DropEnum
DROP TYPE "MonsterPowerDefenceRequirement";

-- DropEnum
DROP TYPE "MonsterPowerDurationType";

-- DropEnum
DROP TYPE "MonsterPowerIntentionType";

-- CreateTable
CREATE TABLE "Power" (
    "id" TEXT NOT NULL,
    "monsterId" TEXT,
    "sourceType" "PowerSourceType" NOT NULL DEFAULT 'MONSTER_POWER',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "rulesVersion" TEXT NOT NULL DEFAULT 'v1',
    "contentRevision" INTEGER NOT NULL DEFAULT 1,
    "previewRendererVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "PowerStatus" NOT NULL DEFAULT 'ACTIVE',
    "descriptorChassis" "DescriptorChassisType" NOT NULL DEFAULT 'IMMEDIATE',
    "descriptorChassisConfig" JSONB NOT NULL DEFAULT '{}',
    "responseRequired" BOOLEAN NOT NULL DEFAULT false,
    "cooldownTurns" INTEGER NOT NULL,
    "cooldownReduction" INTEGER NOT NULL DEFAULT 0,
    "lifespanType" "PowerLifespanType" NOT NULL DEFAULT 'NONE',
    "lifespanTurns" INTEGER,
    "previewSummaryOverride" TEXT,
    "meleeTargets" INTEGER,
    "rangedTargets" INTEGER,
    "rangedDistanceFeet" INTEGER,
    "aoeCenterRangeFeet" INTEGER,
    "aoeCount" INTEGER,
    "aoeShape" "AoEShape",
    "aoeSphereRadiusFeet" INTEGER,
    "aoeConeLengthFeet" INTEGER,
    "aoeLineWidthFeet" INTEGER,
    "aoeLineLengthFeet" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Power_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PowerLimitBreakUsage" (
    "id" TEXT NOT NULL,
    "actorType" "LimitBreakActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "powerId" TEXT NOT NULL,
    "usedAtLevel" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PowerLimitBreakUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PowerRangeCategory" (
    "powerId" TEXT NOT NULL,
    "rangeCategory" "RangeCategory" NOT NULL,

    CONSTRAINT "PowerRangeCategory_pkey" PRIMARY KEY ("powerId","rangeCategory")
);

-- CreateTable
CREATE TABLE "EffectPacket" (
    "id" TEXT NOT NULL,
    "powerId" TEXT NOT NULL,
    "packetIndex" INTEGER NOT NULL DEFAULT 0,
    "hostility" "PacketHostility" NOT NULL,
    "intention" "PowerIntention" NOT NULL,
    "specific" TEXT,
    "diceCount" INTEGER NOT NULL,
    "potency" INTEGER NOT NULL,
    "effectTimingType" "EffectTimingType" NOT NULL,
    "effectTimingTurns" INTEGER,
    "effectDurationType" "EffectDurationType" NOT NULL,
    "effectDurationTurns" INTEGER,
    "dealsWounds" BOOLEAN NOT NULL DEFAULT false,
    "woundChannel" "WoundChannel",
    "targetedAttribute" "CoreAttribute",
    "applicationModeKey" TEXT,
    "resolutionOrigin" "ResolutionOrigin" NOT NULL DEFAULT 'CASTER',
    "detailsJson" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "EffectPacket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EffectPacketLocalTargetingOverride" (
    "packetId" TEXT NOT NULL,
    "meleeTargets" INTEGER,
    "rangedTargets" INTEGER,
    "rangedDistanceFeet" INTEGER,
    "aoeCenterRangeFeet" INTEGER,
    "aoeCount" INTEGER,
    "aoeShape" "AoEShape",
    "aoeSphereRadiusFeet" INTEGER,
    "aoeConeLengthFeet" INTEGER,
    "aoeLineWidthFeet" INTEGER,
    "aoeLineLengthFeet" INTEGER,

    CONSTRAINT "EffectPacketLocalTargetingOverride_pkey" PRIMARY KEY ("packetId")
);

-- CreateTable
CREATE TABLE "PrimaryDefenceGate" (
    "powerId" TEXT NOT NULL,
    "sourcePacketIndex" INTEGER NOT NULL DEFAULT 0,
    "gateResult" "PrimaryDefenceGateResult" NOT NULL,
    "protectionChannel" "ProtectionChannel",
    "resistAttribute" "CoreAttribute",
    "hostileEntryPattern" "HostileEntryPattern",
    "resolutionSource" "GateResolutionSource" NOT NULL DEFAULT 'INFERRED',

    CONSTRAINT "PrimaryDefenceGate_pkey" PRIMARY KEY ("powerId")
);

-- CreateTable
CREATE TABLE "PowerTag" (
    "id" TEXT NOT NULL,
    "powerId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PowerTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Power_monsterId_sortOrder_idx" ON "Power"("monsterId", "sortOrder");

-- CreateIndex
CREATE INDEX "Power_sourceType_idx" ON "Power"("sourceType");

-- CreateIndex
CREATE INDEX "PowerLimitBreakUsage_actorType_actorId_idx" ON "PowerLimitBreakUsage"("actorType", "actorId");

-- CreateIndex
CREATE INDEX "PowerLimitBreakUsage_powerId_idx" ON "PowerLimitBreakUsage"("powerId");

-- CreateIndex
CREATE UNIQUE INDEX "PowerLimitBreakUsage_actorType_actorId_powerId_usedAtLevel_key" ON "PowerLimitBreakUsage"("actorType", "actorId", "powerId", "usedAtLevel");

-- CreateIndex
CREATE INDEX "EffectPacket_powerId_packetIndex_idx" ON "EffectPacket"("powerId", "packetIndex");

-- CreateIndex
CREATE INDEX "PowerTag_tag_idx" ON "PowerTag"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "PowerTag_powerId_tag_key" ON "PowerTag"("powerId", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "LimitBreakProfile_powerId_tier_key" ON "LimitBreakProfile"("powerId", "tier");

-- CreateIndex
CREATE INDEX "LimitBreakTemplate_intention_idx" ON "LimitBreakTemplate"("intention");

-- AddForeignKey
ALTER TABLE "Power" ADD CONSTRAINT "Power_monsterId_fkey" FOREIGN KEY ("monsterId") REFERENCES "Monster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LimitBreakProfile" ADD CONSTRAINT "LimitBreakProfile_powerId_fkey" FOREIGN KEY ("powerId") REFERENCES "Power"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PowerLimitBreakUsage" ADD CONSTRAINT "PowerLimitBreakUsage_powerId_fkey" FOREIGN KEY ("powerId") REFERENCES "Power"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PowerRangeCategory" ADD CONSTRAINT "PowerRangeCategory_powerId_fkey" FOREIGN KEY ("powerId") REFERENCES "Power"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EffectPacket" ADD CONSTRAINT "EffectPacket_powerId_fkey" FOREIGN KEY ("powerId") REFERENCES "Power"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EffectPacketLocalTargetingOverride" ADD CONSTRAINT "EffectPacketLocalTargetingOverride_packetId_fkey" FOREIGN KEY ("packetId") REFERENCES "EffectPacket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrimaryDefenceGate" ADD CONSTRAINT "PrimaryDefenceGate_powerId_fkey" FOREIGN KEY ("powerId") REFERENCES "Power"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PowerTag" ADD CONSTRAINT "PowerTag_powerId_fkey" FOREIGN KEY ("powerId") REFERENCES "Power"("id") ON DELETE CASCADE ON UPDATE CASCADE;
