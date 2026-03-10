/*
  Warnings:

  - You are about to drop the column `feetItemId` on the `Monster` table. All the data in the column will be lost.
  - You are about to drop the column `legsItemId` on the `Monster` table. All the data in the column will be lost.
  - You are about to drop the column `shoulderItemId` on the `Monster` table. All the data in the column will be lost.
  - You are about to drop the column `torsoItemId` on the `Monster` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CombatTuning" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Monster" DROP COLUMN "feetItemId",
DROP COLUMN "legsItemId",
DROP COLUMN "shoulderItemId",
DROP COLUMN "torsoItemId";
