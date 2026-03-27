/*
  Warnings:

  - The values [COUNTER,CONVERSION,SEQUENCE] on the enum `DescriptorChassisType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `responseRequired` on the `Power` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "CounterMode" AS ENUM ('NO', 'YES');

-- CreateEnum
CREATE TYPE "CommitmentModifier" AS ENUM ('STANDARD', 'CHANNEL', 'CHARGE');

-- AlterEnum
BEGIN;
CREATE TYPE "DescriptorChassisType_new" AS ENUM ('IMMEDIATE', 'FIELD', 'ATTACHED', 'TRIGGER', 'RESERVE');
ALTER TABLE "public"."Power" ALTER COLUMN "descriptorChassis" DROP DEFAULT;
ALTER TABLE "Power" ALTER COLUMN "descriptorChassis" TYPE "DescriptorChassisType_new" USING ("descriptorChassis"::text::"DescriptorChassisType_new");
ALTER TYPE "DescriptorChassisType" RENAME TO "DescriptorChassisType_old";
ALTER TYPE "DescriptorChassisType_new" RENAME TO "DescriptorChassisType";
DROP TYPE "public"."DescriptorChassisType_old";
ALTER TABLE "Power" ALTER COLUMN "descriptorChassis" SET DEFAULT 'IMMEDIATE';
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EffectTimingType" ADD VALUE 'ON_ATTACH';
ALTER TYPE "EffectTimingType" ADD VALUE 'ON_RELEASE';

-- AlterTable
ALTER TABLE "Power" DROP COLUMN "responseRequired",
ADD COLUMN     "commitmentModifier" "CommitmentModifier" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "counterMode" "CounterMode" NOT NULL DEFAULT 'NO';
