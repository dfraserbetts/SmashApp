-- AlterEnum
ALTER TYPE "ItemType" ADD VALUE 'CONSUMABLE';

-- AlterTable
ALTER TABLE "ItemTemplate" ALTER COLUMN "GlobalAttributeModifiers" DROP NOT NULL;
