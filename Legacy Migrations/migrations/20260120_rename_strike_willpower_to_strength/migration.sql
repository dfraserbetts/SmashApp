DO $$
BEGIN
  -- Global legacy columns (still present per init migration)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ItemTemplate'
      AND column_name = 'StrikeValue'
  ) THEN
    ALTER TABLE "ItemTemplate" RENAME COLUMN "StrikeValue" TO "PhysicalStrength";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ItemTemplate'
      AND column_name = 'WillpowerValue'
  ) THEN
    ALTER TABLE "ItemTemplate" RENAME COLUMN "WillpowerValue" TO "MentalStrength";
  END IF;

  -- Per-range columns (you confirmed these exist in Supabase today)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ItemTemplate'
      AND column_name = 'meleeStrikeValue'
  ) THEN
    ALTER TABLE "ItemTemplate" RENAME COLUMN "meleeStrikeValue" TO "meleePhysicalStrength";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ItemTemplate'
      AND column_name = 'meleeWillpowerValue'
  ) THEN
    ALTER TABLE "ItemTemplate" RENAME COLUMN "meleeWillpowerValue" TO "meleeMentalStrength";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ItemTemplate'
      AND column_name = 'rangedStrikeValue'
  ) THEN
    ALTER TABLE "ItemTemplate" RENAME COLUMN "rangedStrikeValue" TO "rangedPhysicalStrength";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ItemTemplate'
      AND column_name = 'rangedWillpowerValue'
  ) THEN
    ALTER TABLE "ItemTemplate" RENAME COLUMN "rangedWillpowerValue" TO "rangedMentalStrength";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ItemTemplate'
      AND column_name = 'aoeStrikeValue'
  ) THEN
    ALTER TABLE "ItemTemplate" RENAME COLUMN "aoeStrikeValue" TO "aoePhysicalStrength";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ItemTemplate'
      AND column_name = 'aoeWillpowerValue'
  ) THEN
    ALTER TABLE "ItemTemplate" RENAME COLUMN "aoeWillpowerValue" TO "aoeMentalStrength";
  END IF;
END $$;
