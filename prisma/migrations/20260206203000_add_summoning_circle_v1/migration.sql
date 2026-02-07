-- CreateEnum
CREATE TYPE "MonsterTier" AS ENUM ('MINION', 'SOLDIER', 'ELITE', 'BOSS');

-- CreateEnum
CREATE TYPE "MonsterSource" AS ENUM ('CORE', 'CAMPAIGN');

-- CreateEnum
CREATE TYPE "MonsterAttackMode" AS ENUM ('EQUIPPED_WEAPON', 'NATURAL_WEAPON');

-- CreateEnum
CREATE TYPE "DiceSize" AS ENUM ('D4', 'D6', 'D8', 'D10', 'D12');

-- CreateEnum
CREATE TYPE "MonsterPowerDurationType" AS ENUM ('INSTANT', 'TURNS', 'PASSIVE');

-- CreateEnum
CREATE TYPE "MonsterPowerDefenceRequirement" AS ENUM ('PROTECTION', 'RESIST', 'NONE');

-- CreateEnum
CREATE TYPE "MonsterPowerIntentionType" AS ENUM (
  'ATTACK',
  'DEFENCE',
  'HEALING',
  'CLEANSE',
  'CONTROL',
  'MOVEMENT',
  'AUGMENT',
  'DEBUFF',
  'SUMMON',
  'TRANSFORMATION'
);

-- CreateTable
CREATE TABLE "Monster" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "name" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  "tier" "MonsterTier" NOT NULL,
  "legendary" BOOLEAN NOT NULL DEFAULT false,
  "source" "MonsterSource" NOT NULL DEFAULT 'CAMPAIGN',
  "isReadOnly" BOOLEAN NOT NULL DEFAULT false,
  "campaignId" TEXT,
  "attackMode" "MonsterAttackMode" NOT NULL DEFAULT 'NATURAL_WEAPON',
  "equippedWeaponId" TEXT,
  "customNotes" TEXT,
  "physicalResilienceCurrent" INTEGER NOT NULL,
  "physicalResilienceMax" INTEGER NOT NULL,
  "mentalPerseveranceCurrent" INTEGER NOT NULL,
  "mentalPerseveranceMax" INTEGER NOT NULL,
  "physicalProtection" INTEGER NOT NULL,
  "mentalProtection" INTEGER NOT NULL,
  "attackDie" "DiceSize" NOT NULL,
  "attackResistDie" "DiceSize",
  "attackModifier" INTEGER NOT NULL DEFAULT 0,
  "defenceDie" "DiceSize" NOT NULL,
  "defenceResistDie" "DiceSize",
  "defenceModifier" INTEGER NOT NULL DEFAULT 0,
  "fortitudeDie" "DiceSize" NOT NULL,
  "fortitudeResistDie" "DiceSize",
  "fortitudeModifier" INTEGER NOT NULL DEFAULT 0,
  "intellectDie" "DiceSize" NOT NULL,
  "intellectResistDie" "DiceSize",
  "intellectModifier" INTEGER NOT NULL DEFAULT 0,
  "supportDie" "DiceSize" NOT NULL,
  "supportResistDie" "DiceSize",
  "supportModifier" INTEGER NOT NULL DEFAULT 0,
  "braveryDie" "DiceSize" NOT NULL,
  "braveryResistDie" "DiceSize",
  "braveryModifier" INTEGER NOT NULL DEFAULT 0,
  "weaponSkillValue" INTEGER NOT NULL,
  "weaponSkillModifier" INTEGER NOT NULL DEFAULT 0,
  "armorSkillValue" INTEGER NOT NULL,
  "armorSkillModifier" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "Monster_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Monster_level_min" CHECK ("level" >= 1),
  CONSTRAINT "Monster_pr_nonnegative" CHECK ("physicalResilienceCurrent" >= 0 AND "physicalResilienceMax" >= 0),
  CONSTRAINT "Monster_mp_nonnegative" CHECK ("mentalPerseveranceCurrent" >= 0 AND "mentalPerseveranceMax" >= 0),
  CONSTRAINT "Monster_skill_values_min" CHECK ("weaponSkillValue" >= 1 AND "armorSkillValue" >= 1),
  CONSTRAINT "Monster_core_scope" CHECK (("source" = 'CORE' AND "campaignId" IS NULL) OR ("source" = 'CAMPAIGN' AND "campaignId" IS NOT NULL))
);

-- CreateTable
CREATE TABLE "MonsterTag" (
  "id" TEXT NOT NULL,
  "monsterId" TEXT NOT NULL,
  "tag" TEXT NOT NULL,

  CONSTRAINT "MonsterTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonsterTrait" (
  "id" TEXT NOT NULL,
  "monsterId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "text" TEXT NOT NULL,

  CONSTRAINT "MonsterTrait_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonsterNaturalAttack" (
  "id" TEXT NOT NULL,
  "monsterId" TEXT NOT NULL,
  "attackName" TEXT NOT NULL,
  "attackConfig" JSONB NOT NULL DEFAULT '{}',

  CONSTRAINT "MonsterNaturalAttack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonsterPower" (
  "id" TEXT NOT NULL,
  "monsterId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "diceCount" INTEGER NOT NULL,
  "potency" INTEGER NOT NULL,
  "durationType" "MonsterPowerDurationType" NOT NULL,
  "durationTurns" INTEGER,
  "defenceRequirement" "MonsterPowerDefenceRequirement" NOT NULL DEFAULT 'NONE',
  "cooldownTurns" INTEGER NOT NULL,
  "cooldownReduction" INTEGER NOT NULL DEFAULT 0,
  "responseRequired" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "MonsterPower_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MonsterPower_dice_count_range" CHECK ("diceCount" >= 1 AND "diceCount" <= 20),
  CONSTRAINT "MonsterPower_potency_range" CHECK ("potency" >= 1 AND "potency" <= 5),
  CONSTRAINT "MonsterPower_cooldown_min" CHECK ("cooldownTurns" >= 1),
  CONSTRAINT "MonsterPower_cooldown_reduction_bounds" CHECK ("cooldownReduction" >= 0 AND "cooldownReduction" < "cooldownTurns"),
  CONSTRAINT "MonsterPower_duration_turns_rules" CHECK (
    ("durationType" = 'TURNS' AND "durationTurns" >= 1 AND "durationTurns" <= 4)
    OR
    ("durationType" <> 'TURNS' AND "durationTurns" IS NULL)
  )
);

-- CreateTable
CREATE TABLE "MonsterPowerIntention" (
  "id" TEXT NOT NULL,
  "powerId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "type" "MonsterPowerIntentionType" NOT NULL,
  "detailsJson" JSONB NOT NULL DEFAULT '{}',

  CONSTRAINT "MonsterPowerIntention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Monster_campaignId_idx" ON "Monster"("campaignId");

-- CreateIndex
CREATE INDEX "Monster_source_idx" ON "Monster"("source");

-- CreateIndex
CREATE INDEX "MonsterTag_tag_idx" ON "MonsterTag"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "MonsterTag_monsterId_tag_key" ON "MonsterTag"("monsterId", "tag");

-- CreateIndex
CREATE INDEX "MonsterTrait_monsterId_sortOrder_idx" ON "MonsterTrait"("monsterId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MonsterNaturalAttack_monsterId_key" ON "MonsterNaturalAttack"("monsterId");

-- CreateIndex
CREATE INDEX "MonsterPower_monsterId_sortOrder_idx" ON "MonsterPower"("monsterId", "sortOrder");

-- CreateIndex
CREATE INDEX "MonsterPowerIntention_powerId_sortOrder_idx" ON "MonsterPowerIntention"("powerId", "sortOrder");

-- AddForeignKey
ALTER TABLE "Monster" ADD CONSTRAINT "Monster_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonsterTag" ADD CONSTRAINT "MonsterTag_monsterId_fkey"
FOREIGN KEY ("monsterId") REFERENCES "Monster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonsterTrait" ADD CONSTRAINT "MonsterTrait_monsterId_fkey"
FOREIGN KEY ("monsterId") REFERENCES "Monster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonsterNaturalAttack" ADD CONSTRAINT "MonsterNaturalAttack_monsterId_fkey"
FOREIGN KEY ("monsterId") REFERENCES "Monster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonsterPower" ADD CONSTRAINT "MonsterPower_monsterId_fkey"
FOREIGN KEY ("monsterId") REFERENCES "Monster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonsterPowerIntention" ADD CONSTRAINT "MonsterPowerIntention_powerId_fkey"
FOREIGN KEY ("powerId") REFERENCES "MonsterPower"("id") ON DELETE CASCADE ON UPDATE CASCADE;
