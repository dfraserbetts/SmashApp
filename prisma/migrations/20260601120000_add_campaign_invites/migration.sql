CREATE TABLE "CampaignInvite" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "invitedEmail" TEXT NOT NULL,
    "invitedEmailNormalized" TEXT NOT NULL,
    "invitedUserId" UUID NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "playerName" TEXT,
    "emailDeliveryStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailSentAt" TIMESTAMP(3),

    CONSTRAINT "CampaignInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignInvite_campaignId_invitedUserId_key" ON "CampaignInvite"("campaignId", "invitedUserId");
CREATE INDEX "CampaignInvite_campaignId_idx" ON "CampaignInvite"("campaignId");
CREATE INDEX "CampaignInvite_invitedUserId_idx" ON "CampaignInvite"("invitedUserId");
CREATE INDEX "CampaignInvite_invitedEmailNormalized_idx" ON "CampaignInvite"("invitedEmailNormalized");

ALTER TABLE "CampaignInvite" ADD CONSTRAINT "CampaignInvite_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."CampaignInvite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CampaignInvite" FORCE ROW LEVEL SECURITY;
