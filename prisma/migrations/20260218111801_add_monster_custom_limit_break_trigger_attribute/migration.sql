-- CreateEnum
CREATE TYPE "CoreAttribute" AS ENUM ('ATTACK', 'DEFENCE', 'FORTITUDE', 'INTELLECT', 'SUPPORT', 'BRAVERY');

-- AlterTable
ALTER TABLE "Monster" ADD COLUMN     "limitBreakAttribute" "CoreAttribute",
ADD COLUMN     "limitBreakTriggerText" TEXT;
