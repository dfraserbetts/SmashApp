/*
  Warnings:

  - Made the column `GlobalAttributeModifiers` on table `ItemTemplate` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
ALTER TYPE "ForgeConfigCategory" ADD VALUE 'CONSUMABLES';

-- AlterTable
ALTER TABLE "ItemTemplate" ALTER COLUMN "GlobalAttributeModifiers" SET NOT NULL,
ALTER COLUMN "GlobalAttributeModifiers" SET DEFAULT '[]';
