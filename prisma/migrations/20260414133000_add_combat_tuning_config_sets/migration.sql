-- CreateEnum
CREATE TYPE "CombatTuningConfigStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "CombatTuningConfigSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "CombatTuningConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "CombatTuningConfigSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CombatTuningConfigEntry" (
    "id" TEXT NOT NULL,
    "configSetId" TEXT NOT NULL,
    "configKey" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CombatTuningConfigEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CombatTuningConfigSet_slug_key" ON "CombatTuningConfigSet"("slug");

-- CreateIndex
CREATE INDEX "CombatTuningConfigSet_status_updatedAt_idx" ON "CombatTuningConfigSet"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CombatTuningConfigEntry_configSetId_configKey_key" ON "CombatTuningConfigEntry"("configSetId", "configKey");

-- CreateIndex
CREATE INDEX "CombatTuningConfigEntry_configSetId_sortOrder_idx" ON "CombatTuningConfigEntry"("configSetId", "sortOrder");

-- AddForeignKey
ALTER TABLE "CombatTuningConfigEntry" ADD CONSTRAINT "CombatTuningConfigEntry_configSetId_fkey" FOREIGN KEY ("configSetId") REFERENCES "CombatTuningConfigSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
