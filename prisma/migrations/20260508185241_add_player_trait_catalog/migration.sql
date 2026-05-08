CREATE TYPE "PlayerTraitClassification" AS ENUM ('POSITIVE', 'NEGATIVE');

CREATE TABLE "PlayerTrait" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "descriptor" TEXT NOT NULL,
  "classification" "PlayerTraitClassification" NOT NULL DEFAULT 'POSITIVE',
  "pointValue" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlayerTrait_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerTrait_name_key" ON "PlayerTrait"("name");
CREATE INDEX "PlayerTrait_isActive_name_idx" ON "PlayerTrait"("isActive", "name");

INSERT INTO "PlayerTrait" ("id", "name", "descriptor", "classification", "pointValue", "isActive", "notes")
VALUES
  ('keen_eye', 'Keen Eye', 'You notice small details others miss and are quick to spot hidden opportunities.', 'POSITIVE', 1, true, 'Seeded from the Step 6 scaffold catalog.'),
  ('steady_nerves', 'Steady Nerves', 'Pressure rarely shakes you; your calm presence is obvious in tense moments.', 'POSITIVE', 1, true, 'Seeded from the Step 6 scaffold catalog.'),
  ('oathbound', 'Oathbound', 'A serious promise limits your choices and can complicate travel, alliances, or rewards.', 'NEGATIVE', 1, true, 'Seeded from the Step 6 scaffold catalog.'),
  ('known_rival', 'Known Rival', 'Someone capable has a personal reason to oppose you and may appear at difficult times.', 'NEGATIVE', 1, true, 'Seeded from the Step 6 scaffold catalog.')
ON CONFLICT ("id") DO NOTHING;
