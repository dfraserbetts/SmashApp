-- CreateEnum
CREATE TYPE "PlayerRestrictionConsumerType" AS ENUM ('PLAYER_POWER', 'SIGNATURE_MOVE', 'ROLEPLAY_ABILITY');

-- CreateEnum
CREATE TYPE "PlayerRestrictionLifecycle" AS ENUM ('DRAFT', 'PENDING_GD_APPROVAL', 'APPROVED', 'CHANGES_REQUESTED', 'APPROVAL_STALE');

-- CreateEnum
CREATE TYPE "PlayerRestrictionTier" AS ENUM ('MATERIAL_LIMITATION', 'SUBSTANTIAL_LIMITATION', 'NARROW_AVAILABILITY', 'OATH_LIMITATION');

-- CreateEnum
CREATE TYPE "PlayerRestrictionReviewAction" AS ENUM ('SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED', 'APPROVAL_STALE');

-- CreateTable
CREATE TABLE "PlayerRestrictionGovernance" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "campaignId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "consumerType" "PlayerRestrictionConsumerType" NOT NULL,
    "consumerId" TEXT NOT NULL,
    "lifecycle" "PlayerRestrictionLifecycle" NOT NULL DEFAULT 'DRAFT',
    "submissionRevision" INTEGER NOT NULL DEFAULT 0,
    "submittedFingerprint" TEXT,
    "submittedDefinitionJson" JSONB,
    "submittedByUserId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedFingerprint" TEXT,
    "selectedTier" "PlayerRestrictionTier",
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerRestrictionGovernance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerRestrictionReviewEvent" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "governanceId" TEXT NOT NULL,
    "action" "PlayerRestrictionReviewAction" NOT NULL,
    "fromLifecycle" "PlayerRestrictionLifecycle" NOT NULL,
    "toLifecycle" "PlayerRestrictionLifecycle" NOT NULL,
    "submissionRevision" INTEGER NOT NULL,
    "semanticFingerprint" TEXT NOT NULL,
    "semanticDefinitionJson" JSONB NOT NULL,
    "selectedTier" "PlayerRestrictionTier",
    "actorUserId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerRestrictionReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerRestrictionGovernance_characterId_consumerType_consumerId_key" ON "PlayerRestrictionGovernance"("characterId", "consumerType", "consumerId");

-- CreateIndex
CREATE INDEX "PlayerRestrictionGovernance_campaignId_lifecycle_submittedAt_idx" ON "PlayerRestrictionGovernance"("campaignId", "lifecycle", "submittedAt");

-- CreateIndex
CREATE INDEX "PlayerRestrictionGovernance_characterId_idx" ON "PlayerRestrictionGovernance"("characterId");

-- CreateIndex
CREATE INDEX "PlayerRestrictionGovernance_submittedByUserId_idx" ON "PlayerRestrictionGovernance"("submittedByUserId");

-- CreateIndex
CREATE INDEX "PlayerRestrictionGovernance_reviewedByUserId_idx" ON "PlayerRestrictionGovernance"("reviewedByUserId");

-- CreateIndex
CREATE INDEX "PlayerRestrictionReviewEvent_governanceId_createdAt_idx" ON "PlayerRestrictionReviewEvent"("governanceId", "createdAt");

-- CreateIndex
CREATE INDEX "PlayerRestrictionReviewEvent_actorUserId_createdAt_idx" ON "PlayerRestrictionReviewEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PlayerRestrictionReviewEvent_action_createdAt_idx" ON "PlayerRestrictionReviewEvent"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "PlayerRestrictionGovernance" ADD CONSTRAINT "PlayerRestrictionGovernance_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRestrictionGovernance" ADD CONSTRAINT "PlayerRestrictionGovernance_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "CampaignCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRestrictionReviewEvent" ADD CONSTRAINT "PlayerRestrictionReviewEvent_governanceId_fkey" FOREIGN KEY ("governanceId") REFERENCES "PlayerRestrictionGovernance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
