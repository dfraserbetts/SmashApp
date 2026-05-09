-- AlterTable
ALTER TABLE "CampaignUser" ADD COLUMN     "playerName" TEXT;

-- RenameIndex
ALTER INDEX "CampaignCharacterBackpackItem_characterId_partyInventoryItemId_" RENAME TO "CampaignCharacterBackpackItem_characterId_partyInventoryIte_key";
