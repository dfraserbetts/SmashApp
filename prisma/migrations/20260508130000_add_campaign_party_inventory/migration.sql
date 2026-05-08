CREATE TABLE "CampaignPartyInventoryItem" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "itemTemplateId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignPartyInventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignCharacterBackpackItem" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "partyInventoryItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignCharacterBackpackItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignPartyInventoryItem_campaignId_itemTemplateId_key"
ON "CampaignPartyInventoryItem"("campaignId", "itemTemplateId");

CREATE INDEX "CampaignPartyInventoryItem_campaignId_idx"
ON "CampaignPartyInventoryItem"("campaignId");

CREATE INDEX "CampaignPartyInventoryItem_itemTemplateId_idx"
ON "CampaignPartyInventoryItem"("itemTemplateId");

CREATE UNIQUE INDEX "CampaignCharacterBackpackItem_characterId_partyInventoryItemId_key"
ON "CampaignCharacterBackpackItem"("characterId", "partyInventoryItemId");

CREATE INDEX "CampaignCharacterBackpackItem_campaignId_idx"
ON "CampaignCharacterBackpackItem"("campaignId");

CREATE INDEX "CampaignCharacterBackpackItem_characterId_idx"
ON "CampaignCharacterBackpackItem"("characterId");

CREATE INDEX "CampaignCharacterBackpackItem_partyInventoryItemId_idx"
ON "CampaignCharacterBackpackItem"("partyInventoryItemId");

ALTER TABLE "CampaignPartyInventoryItem"
ADD CONSTRAINT "CampaignPartyInventoryItem_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignPartyInventoryItem"
ADD CONSTRAINT "CampaignPartyInventoryItem_itemTemplateId_fkey"
FOREIGN KEY ("itemTemplateId") REFERENCES "ItemTemplate"("ItemID") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CampaignCharacterBackpackItem"
ADD CONSTRAINT "CampaignCharacterBackpackItem_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignCharacterBackpackItem"
ADD CONSTRAINT "CampaignCharacterBackpackItem_characterId_fkey"
FOREIGN KEY ("characterId") REFERENCES "CampaignCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignCharacterBackpackItem"
ADD CONSTRAINT "CampaignCharacterBackpackItem_partyInventoryItemId_fkey"
FOREIGN KEY ("partyInventoryItemId") REFERENCES "CampaignPartyInventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
