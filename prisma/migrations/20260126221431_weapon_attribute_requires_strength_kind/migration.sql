-- CreateEnum
CREATE TYPE "StrengthKind" AS ENUM ('PHYSICAL', 'MENTAL');

-- AlterTable
ALTER TABLE "WeaponAttribute" ADD COLUMN     "requiresStrengthKind" "StrengthKind";
