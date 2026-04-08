-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('DELAYED_RELEASE', 'BUILD_POWER');

-- CreateEnum
CREATE TYPE "TriggerMethod" AS ENUM ('ARM_AND_THEN_TARGET', 'TARGET_AND_THEN_ARM');

-- CreateEnum
CREATE TYPE "AttachedHostAnchorType" AS ENUM ('TARGET', 'OBJECT', 'WEAPON', 'ARMOR', 'SELF', 'AREA');

-- CreateEnum
CREATE TYPE "EffectPacketApplyTo" AS ENUM ('PRIMARY_TARGET', 'ALLIES', 'SELF');

-- AlterTable
ALTER TABLE "Power"
ADD COLUMN     "chargeType" "ChargeType",
ADD COLUMN     "chargeTurns" INTEGER,
ADD COLUMN     "chargeBonusDicePerTurn" INTEGER,
ADD COLUMN     "triggerMethod" "TriggerMethod",
ADD COLUMN     "attachedHostAnchorType" "AttachedHostAnchorType";

-- AlterTable
ALTER TABLE "EffectPacket"
ADD COLUMN     "applyTo" "EffectPacketApplyTo",
ADD COLUMN     "effectTriggerText" TEXT;
