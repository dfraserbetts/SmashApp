-- Add combat tuning table (singleton-by-convention) for runtime formula tuning.
CREATE TABLE "CombatTuning" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "protectionK" INTEGER NOT NULL DEFAULT 2,
  "protectionS" INTEGER NOT NULL DEFAULT 6,

  CONSTRAINT "CombatTuning_pkey" PRIMARY KEY ("id")
);
