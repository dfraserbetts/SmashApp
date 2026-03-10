-- Separate armor and accessory slots for Summoning Circle monsters.
ALTER TABLE "Monster"
ADD COLUMN IF NOT EXISTS "headArmorItemId" TEXT,
ADD COLUMN IF NOT EXISTS "shoulderArmorItemId" TEXT,
ADD COLUMN IF NOT EXISTS "torsoArmorItemId" TEXT,
ADD COLUMN IF NOT EXISTS "legsArmorItemId" TEXT,
ADD COLUMN IF NOT EXISTS "feetArmorItemId" TEXT,
ADD COLUMN IF NOT EXISTS "neckItemId" TEXT,
ADD COLUMN IF NOT EXISTS "armsItemId" TEXT,
ADD COLUMN IF NOT EXISTS "beltItemId" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Monster'
      AND column_name = 'headItemId'
  ) THEN
    EXECUTE '
      UPDATE "Monster" AS m
      SET "headArmorItemId" = m."headItemId"
      FROM "ItemTemplate" AS it
      WHERE m."headArmorItemId" IS NULL
        AND m."headItemId" IS NOT NULL
        AND it."ItemID" = m."headItemId"
        AND it."ItemType" = ''ARMOR''
    ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Monster'
      AND column_name = 'shoulderItemId'
  ) THEN
    EXECUTE '
      UPDATE "Monster" AS m
      SET "shoulderArmorItemId" = m."shoulderItemId"
      FROM "ItemTemplate" AS it
      WHERE m."shoulderArmorItemId" IS NULL
        AND m."shoulderItemId" IS NOT NULL
        AND it."ItemID" = m."shoulderItemId"
        AND it."ItemType" = ''ARMOR''
    ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Monster'
      AND column_name = 'torsoItemId'
  ) THEN
    EXECUTE '
      UPDATE "Monster" AS m
      SET "torsoArmorItemId" = m."torsoItemId"
      FROM "ItemTemplate" AS it
      WHERE m."torsoArmorItemId" IS NULL
        AND m."torsoItemId" IS NOT NULL
        AND it."ItemID" = m."torsoItemId"
        AND it."ItemType" = ''ARMOR''
    ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Monster'
      AND column_name = 'legsItemId'
  ) THEN
    EXECUTE '
      UPDATE "Monster" AS m
      SET "legsArmorItemId" = m."legsItemId"
      FROM "ItemTemplate" AS it
      WHERE m."legsArmorItemId" IS NULL
        AND m."legsItemId" IS NOT NULL
        AND it."ItemID" = m."legsItemId"
        AND it."ItemType" = ''ARMOR''
    ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Monster'
      AND column_name = 'feetItemId'
  ) THEN
    EXECUTE '
      UPDATE "Monster" AS m
      SET "feetArmorItemId" = m."feetItemId"
      FROM "ItemTemplate" AS it
      WHERE m."feetArmorItemId" IS NULL
        AND m."feetItemId" IS NOT NULL
        AND it."ItemID" = m."feetItemId"
        AND it."ItemType" = ''ARMOR''
    ';
  END IF;
END $$;
