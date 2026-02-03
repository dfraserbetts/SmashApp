-- AlterTable
ALTER TABLE "ItemTemplateWeaponAttribute" ADD COLUMN     "rangeSource" "RangeCategory";

-- AlterTable
ALTER TABLE "WeaponAttribute" ADD COLUMN     "requiresRangeSelection" BOOLEAN NOT NULL DEFAULT false;
