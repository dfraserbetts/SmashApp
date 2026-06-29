-- CreateEnum
CREATE TYPE "SecondaryDependencyMode" AS ENUM ('INDEPENDENT', 'LINKED_TO_PRIMARY', 'DEPENDENT_SEQUENTIAL', 'TRIGGERED_CONDITIONAL');

-- AlterTable
ALTER TABLE "EffectPacket"
ADD COLUMN     "secondaryDependencyMode" "SecondaryDependencyMode";
