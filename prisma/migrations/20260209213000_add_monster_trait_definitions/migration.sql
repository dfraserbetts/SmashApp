-- CreateTable
CREATE TABLE "MonsterTraitDefinition" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "effectText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "source" "MonsterSource" NOT NULL DEFAULT 'CORE',
  "isReadOnly" BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT "MonsterTraitDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonsterTraitDefinition_name_key" ON "MonsterTraitDefinition"("name");

-- CreateIndex
CREATE INDEX "MonsterTraitDefinition_source_isEnabled_idx" ON "MonsterTraitDefinition"("source", "isEnabled");

-- AddColumn
ALTER TABLE "MonsterTrait" ADD COLUMN "traitDefinitionId" TEXT;

-- Backfill definitions from legacy free-text traits.
INSERT INTO "MonsterTraitDefinition" (
  "id",
  "name",
  "effectText",
  "source",
  "isReadOnly",
  "isEnabled",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  legacy."textValue",
  legacy."textValue",
  'CORE'::"MonsterSource",
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT NULLIF(BTRIM("text"), '') AS "textValue"
  FROM "MonsterTrait"
) legacy
WHERE legacy."textValue" IS NOT NULL;

-- Ensure there is always a fallback trait definition for invalid/empty legacy data.
INSERT INTO "MonsterTraitDefinition" (
  "id",
  "name",
  "effectText",
  "source",
  "isReadOnly",
  "isEnabled",
  "createdAt",
  "updatedAt"
)
VALUES (
  gen_random_uuid()::text,
  'Legacy Trait',
  'Migrated legacy trait',
  'CORE'::"MonsterSource",
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

-- Link each MonsterTrait row to its definition.
UPDATE "MonsterTrait" mt
SET "traitDefinitionId" = mtd."id"
FROM "MonsterTraitDefinition" mtd
WHERE mtd."name" = NULLIF(BTRIM(mt."text"), '');

-- Any remaining rows (blank/null legacy text) point to fallback definition.
UPDATE "MonsterTrait"
SET "traitDefinitionId" = (
  SELECT "id"
  FROM "MonsterTraitDefinition"
  WHERE "name" = 'Legacy Trait'
  LIMIT 1
)
WHERE "traitDefinitionId" IS NULL;

-- Prevent duplicate trait definitions per monster before adding unique constraint.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "monsterId", "traitDefinitionId"
      ORDER BY "sortOrder" ASC, "id" ASC
    ) AS rn
  FROM "MonsterTrait"
)
DELETE FROM "MonsterTrait"
WHERE "id" IN (
  SELECT "id"
  FROM ranked
  WHERE rn > 1
);

-- Enforce new relation and uniqueness.
ALTER TABLE "MonsterTrait"
  ALTER COLUMN "traitDefinitionId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "MonsterTrait_monsterId_traitDefinitionId_key" ON "MonsterTrait"("monsterId", "traitDefinitionId");

-- AddForeignKey
ALTER TABLE "MonsterTrait"
ADD CONSTRAINT "MonsterTrait_traitDefinitionId_fkey"
FOREIGN KEY ("traitDefinitionId") REFERENCES "MonsterTraitDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Remove legacy free-text column.
ALTER TABLE "MonsterTrait" DROP COLUMN "text";
