ALTER TABLE "CampaignUser"
ADD COLUMN "allowHistoricCharacters" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CampaignCharacter"
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archivedByUserId" TEXT,
ADD COLUMN "archiveReason" TEXT;

CREATE INDEX "CampaignCharacter_archivedAt_idx" ON "CampaignCharacter"("archivedAt");
