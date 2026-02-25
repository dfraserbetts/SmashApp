-- AlterTable
ALTER TABLE "Monster" ADD COLUMN     "limitBreak2Attribute" "CoreAttribute",
ADD COLUMN     "limitBreak2CostText" TEXT,
ADD COLUMN     "limitBreak2EffectText" TEXT,
ADD COLUMN     "limitBreak2Name" TEXT,
ADD COLUMN     "limitBreak2ThresholdSuccesses" INTEGER,
ADD COLUMN     "limitBreak2Tier" "LimitBreakTier",
ADD COLUMN     "limitBreak2TriggerText" TEXT;
