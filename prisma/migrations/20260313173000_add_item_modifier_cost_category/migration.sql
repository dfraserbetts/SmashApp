DO $$
BEGIN
  ALTER TYPE "ForgeCostCategory" ADD VALUE IF NOT EXISTS 'ItemModifiers';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
