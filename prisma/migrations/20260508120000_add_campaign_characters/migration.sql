CREATE TABLE "CampaignCharacter" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assignedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignCharacter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CampaignCharacter_campaignId_idx" ON "CampaignCharacter"("campaignId");
CREATE INDEX "CampaignCharacter_assignedUserId_idx" ON "CampaignCharacter"("assignedUserId");

ALTER TABLE "CampaignCharacter"
ADD CONSTRAINT "CampaignCharacter_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
