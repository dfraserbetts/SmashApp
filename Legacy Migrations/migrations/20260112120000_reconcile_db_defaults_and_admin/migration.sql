-- Reconcile DB defaults and admin flag

ALTER TABLE "Campaign"
ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;

ALTER TABLE "UserProfile"
ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT false;
