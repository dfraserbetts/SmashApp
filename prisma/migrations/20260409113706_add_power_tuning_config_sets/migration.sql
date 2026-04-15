-- CreateEnum
CREATE TYPE "PowerTuningConfigStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EffectTimingType" ADD VALUE 'START_OF_TURN_WHILST_CHANNELLED';
ALTER TYPE "EffectTimingType" ADD VALUE 'END_OF_TURN_WHILST_CHANNELLED';

-- CreateTable
CREATE TABLE "PowerTuningConfigSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "PowerTuningConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "PowerTuningConfigSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PowerTuningConfigEntry" (
    "id" TEXT NOT NULL,
    "configSetId" TEXT NOT NULL,
    "configKey" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PowerTuningConfigEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PowerTuningConfigSet_slug_key" ON "PowerTuningConfigSet"("slug");

-- CreateIndex
CREATE INDEX "PowerTuningConfigSet_status_updatedAt_idx" ON "PowerTuningConfigSet"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "PowerTuningConfigEntry_configSetId_sortOrder_idx" ON "PowerTuningConfigEntry"("configSetId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PowerTuningConfigEntry_configSetId_configKey_key" ON "PowerTuningConfigEntry"("configSetId", "configKey");

-- AddForeignKey
ALTER TABLE "PowerTuningConfigEntry" ADD CONSTRAINT "PowerTuningConfigEntry_configSetId_fkey" FOREIGN KEY ("configSetId") REFERENCES "PowerTuningConfigSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
