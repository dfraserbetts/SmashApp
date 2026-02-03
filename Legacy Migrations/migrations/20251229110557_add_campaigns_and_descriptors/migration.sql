/*
  Warnings:

  - Added the required column `CampaignID` to the `ItemTemplate` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CampaignRole" AS ENUM ('GAME_DIRECTOR', 'PLAYER');

-- CreateEnum
CREATE TYPE "DescriptorScope" AS ENUM ('ANY', 'WEAPON', 'ARMOR', 'SHIELD', 'ITEM');

-- AlterTable
ALTER TABLE "ItemTemplate" ADD COLUMN     "CampaignID" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "descriptorVersionTag" TEXT NOT NULL DEFAULT 'v0',

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignUser" (
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CampaignRole" NOT NULL DEFAULT 'PLAYER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignUser_pkey" PRIMARY KEY ("campaignId","userId")
);

-- CreateTable
CREATE TABLE "DescriptorRule" (
    "id" SERIAL NOT NULL,
    "versionTag" TEXT NOT NULL,
    "scope" "DescriptorScope" NOT NULL DEFAULT 'ANY',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "conditionsJson" JSONB NOT NULL DEFAULT '{}',
    "template" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "DescriptorRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_ownerUserId_idx" ON "Campaign"("ownerUserId");

-- CreateIndex
CREATE INDEX "CampaignUser_userId_idx" ON "CampaignUser"("userId");

-- CreateIndex
CREATE INDEX "DescriptorRule_versionTag_scope_priority_idx" ON "DescriptorRule"("versionTag", "scope", "priority");

-- CreateIndex
CREATE INDEX "ItemTemplate_CampaignID_idx" ON "ItemTemplate"("CampaignID");

-- AddForeignKey
ALTER TABLE "ItemTemplate" ADD CONSTRAINT "ItemTemplate_CampaignID_fkey" FOREIGN KEY ("CampaignID") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignUser" ADD CONSTRAINT "CampaignUser_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
