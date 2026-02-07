ALTER TABLE "Monster"
  ALTER COLUMN "attackResistDie" TYPE INTEGER USING (CASE WHEN "attackResistDie" IS NULL THEN 0 ELSE 1 END),
  ALTER COLUMN "attackResistDie" SET DEFAULT 0,
  ALTER COLUMN "attackResistDie" SET NOT NULL,
  ALTER COLUMN "defenceResistDie" TYPE INTEGER USING (CASE WHEN "defenceResistDie" IS NULL THEN 0 ELSE 1 END),
  ALTER COLUMN "defenceResistDie" SET DEFAULT 0,
  ALTER COLUMN "defenceResistDie" SET NOT NULL,
  ALTER COLUMN "fortitudeResistDie" TYPE INTEGER USING (CASE WHEN "fortitudeResistDie" IS NULL THEN 0 ELSE 1 END),
  ALTER COLUMN "fortitudeResistDie" SET DEFAULT 0,
  ALTER COLUMN "fortitudeResistDie" SET NOT NULL,
  ALTER COLUMN "intellectResistDie" TYPE INTEGER USING (CASE WHEN "intellectResistDie" IS NULL THEN 0 ELSE 1 END),
  ALTER COLUMN "intellectResistDie" SET DEFAULT 0,
  ALTER COLUMN "intellectResistDie" SET NOT NULL,
  ALTER COLUMN "supportResistDie" TYPE INTEGER USING (CASE WHEN "supportResistDie" IS NULL THEN 0 ELSE 1 END),
  ALTER COLUMN "supportResistDie" SET DEFAULT 0,
  ALTER COLUMN "supportResistDie" SET NOT NULL,
  ALTER COLUMN "braveryResistDie" TYPE INTEGER USING (CASE WHEN "braveryResistDie" IS NULL THEN 0 ELSE 1 END),
  ALTER COLUMN "braveryResistDie" SET DEFAULT 0,
  ALTER COLUMN "braveryResistDie" SET NOT NULL;

ALTER TABLE "Monster"
  ADD CONSTRAINT "Monster_resist_nonnegative" CHECK (
    "attackResistDie" >= 0 AND
    "defenceResistDie" >= 0 AND
    "fortitudeResistDie" >= 0 AND
    "intellectResistDie" >= 0 AND
    "supportResistDie" >= 0 AND
    "braveryResistDie" >= 0
  );
