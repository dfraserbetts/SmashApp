-- CreateEnum
CREATE TYPE "MonsterAttackEntryMode" AS ENUM ('NATURAL', 'EQUIPPED');

-- CreateTable
CREATE TABLE "MonsterAttack" (
  "id" TEXT NOT NULL,
  "monsterId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "attackMode" "MonsterAttackEntryMode" NOT NULL,
  "attackName" TEXT,
  "attackConfig" JSONB,
  "equippedWeaponId" TEXT,

  CONSTRAINT "MonsterAttack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonsterAttack_monsterId_sortOrder_key" ON "MonsterAttack"("monsterId", "sortOrder");

-- CreateIndex
CREATE INDEX "MonsterAttack_monsterId_sortOrder_idx" ON "MonsterAttack"("monsterId", "sortOrder");

-- AddForeignKey
ALTER TABLE "MonsterAttack"
ADD CONSTRAINT "MonsterAttack_monsterId_fkey"
FOREIGN KEY ("monsterId") REFERENCES "Monster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Constrain sort order to 0..2 to cap attacks to three slots per monster
ALTER TABLE "MonsterAttack"
ADD CONSTRAINT "MonsterAttack_sortOrder_range" CHECK ("sortOrder" >= 0 AND "sortOrder" <= 2);

-- Backfill existing single equipped attacks
INSERT INTO "MonsterAttack" ("id", "monsterId", "sortOrder", "attackMode", "equippedWeaponId")
SELECT
  gen_random_uuid()::text,
  m."id",
  0,
  'EQUIPPED'::"MonsterAttackEntryMode",
  m."equippedWeaponId"
FROM "Monster" m
WHERE
  m."attackMode" = 'EQUIPPED_WEAPON'
  AND m."equippedWeaponId" IS NOT NULL;

-- Backfill existing single natural attacks
INSERT INTO "MonsterAttack" ("id", "monsterId", "sortOrder", "attackMode", "attackName", "attackConfig")
SELECT
  gen_random_uuid()::text,
  m."id",
  0,
  'NATURAL'::"MonsterAttackEntryMode",
  na."attackName",
  na."attackConfig"
FROM "Monster" m
JOIN "MonsterNaturalAttack" na ON na."monsterId" = m."id"
WHERE
  m."attackMode" = 'NATURAL_WEAPON';
