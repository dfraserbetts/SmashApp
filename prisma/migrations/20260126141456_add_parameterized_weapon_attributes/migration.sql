-- AlterTable
ALTER TABLE "ItemTemplateWeaponAttribute" ADD COLUMN     "strengthSource" "RangeCategory";

-- AlterTable
ALTER TABLE "WeaponAttribute" ADD COLUMN     "requiresStrengthSource" BOOLEAN NOT NULL DEFAULT false;
