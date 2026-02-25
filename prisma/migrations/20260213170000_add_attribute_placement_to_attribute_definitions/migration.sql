-- CreateEnum
CREATE TYPE "AttributePlacement" AS ENUM ('ATTACK', 'DEFENCE', 'TRAITS', 'GENERAL');

-- AlterTable
ALTER TABLE "WeaponAttribute"
ADD COLUMN "placement" "AttributePlacement" NOT NULL DEFAULT 'TRAITS';

-- AlterTable
ALTER TABLE "ArmorAttribute"
ADD COLUMN "placement" "AttributePlacement" NOT NULL DEFAULT 'TRAITS';

-- AlterTable
ALTER TABLE "ShieldAttribute"
ADD COLUMN "placement" "AttributePlacement" NOT NULL DEFAULT 'TRAITS';
