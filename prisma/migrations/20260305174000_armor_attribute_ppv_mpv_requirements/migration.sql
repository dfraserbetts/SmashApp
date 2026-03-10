-- Add armor-attribute gating flags for Forge selection requirements.
ALTER TABLE "ArmorAttribute"
ADD COLUMN "requiresPpv" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requiresMpv" BOOLEAN NOT NULL DEFAULT false;
