-- Add item-first equipment slots for Summoning Circle monsters.
ALTER TABLE "Monster"
ADD COLUMN "mainHandItemId" TEXT,
ADD COLUMN "offHandItemId" TEXT,
ADD COLUMN "smallItemId" TEXT,
ADD COLUMN "headItemId" TEXT,
ADD COLUMN "shoulderItemId" TEXT,
ADD COLUMN "torsoItemId" TEXT,
ADD COLUMN "legsItemId" TEXT,
ADD COLUMN "feetItemId" TEXT;
