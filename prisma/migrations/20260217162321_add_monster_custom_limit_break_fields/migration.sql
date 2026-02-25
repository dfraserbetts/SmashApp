-- AlterTable
ALTER TABLE "Monster" ADD COLUMN     "limitBreakCostText" TEXT,
ADD COLUMN     "limitBreakEffectText" TEXT,
ADD COLUMN     "limitBreakName" TEXT,
ADD COLUMN     "limitBreakThresholdSuccesses" INTEGER,
ADD COLUMN     "limitBreakTier" "LimitBreakTier";
