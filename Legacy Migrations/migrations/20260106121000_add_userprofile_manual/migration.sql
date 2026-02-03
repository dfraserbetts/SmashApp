-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "EntitlementTier" AS ENUM ('FREE', 'PAID');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserProfile" (
  "userId" TEXT NOT NULL,
  "entitlementTier" "EntitlementTier" NOT NULL DEFAULT 'FREE',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);
