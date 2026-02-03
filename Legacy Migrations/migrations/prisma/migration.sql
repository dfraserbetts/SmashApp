-- Reconcile DB defaults and admin flag (manual baseline migration)

-- Align Campaign.id default with schema expectation
ALTER TABLE "Campaign"
ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;

-- Align UserProfile with schema expectation
ALTER TABLE "UserProfile"
ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT false;