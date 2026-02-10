-- AlterTable
ALTER TABLE "LimitBreakTemplate" ADD COLUMN     "endCostKey" TEXT,
ADD COLUMN     "endCostParams" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "persistentCostTiming" TEXT;
