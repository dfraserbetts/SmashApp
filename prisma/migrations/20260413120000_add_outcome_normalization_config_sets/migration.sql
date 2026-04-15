-- CreateEnum
CREATE TYPE "OutcomeNormalizationConfigStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "OutcomeNormalizationConfigSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "OutcomeNormalizationConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "OutcomeNormalizationConfigSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutcomeNormalizationConfigEntry" (
    "id" TEXT NOT NULL,
    "configSetId" TEXT NOT NULL,
    "configKey" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OutcomeNormalizationConfigEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutcomeNormalizationConfigSet_slug_key" ON "OutcomeNormalizationConfigSet"("slug");

-- CreateIndex
CREATE INDEX "OutcomeNormalizationConfigSet_status_updatedAt_idx" ON "OutcomeNormalizationConfigSet"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "OutcomeNormalizationConfigEntry_configSetId_sortOrder_idx" ON "OutcomeNormalizationConfigEntry"("configSetId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "OutcomeNormalizationConfigEntry_configSetId_configKey_key" ON "OutcomeNormalizationConfigEntry"("configSetId", "configKey");

-- AddForeignKey
ALTER TABLE "OutcomeNormalizationConfigEntry" ADD CONSTRAINT "OutcomeNormalizationConfigEntry_configSetId_fkey" FOREIGN KEY ("configSetId") REFERENCES "OutcomeNormalizationConfigSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
