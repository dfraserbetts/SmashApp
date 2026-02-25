-- Add persisted image crop position for summoning circle monsters.
ALTER TABLE "Monster"
ADD COLUMN "imagePosX" DOUBLE PRECISION NOT NULL DEFAULT 50,
ADD COLUMN "imagePosY" DOUBLE PRECISION NOT NULL DEFAULT 35;
