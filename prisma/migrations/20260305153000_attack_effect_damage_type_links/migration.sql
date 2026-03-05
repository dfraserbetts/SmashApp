CREATE TABLE "AttackEffectDamageType" (
    "attackEffectId" INTEGER NOT NULL,
    "damageTypeId" INTEGER NOT NULL,

    CONSTRAINT "AttackEffectDamageType_pkey" PRIMARY KEY ("attackEffectId","damageTypeId")
);

CREATE INDEX "AttackEffectDamageType_damageTypeId_idx" ON "AttackEffectDamageType"("damageTypeId");

ALTER TABLE "AttackEffectDamageType"
ADD CONSTRAINT "AttackEffectDamageType_attackEffectId_fkey"
FOREIGN KEY ("attackEffectId") REFERENCES "AttackEffect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AttackEffectDamageType"
ADD CONSTRAINT "AttackEffectDamageType_damageTypeId_fkey"
FOREIGN KEY ("damageTypeId") REFERENCES "DamageType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "AttackEffectDamageType" ("attackEffectId", "damageTypeId")
SELECT ae."id", dt."id"
FROM "AttackEffect" ae
JOIN "DamageType" dt ON lower(dt."name") = 'blunt'
WHERE lower(ae."name") = 'impact'
ON CONFLICT DO NOTHING;

INSERT INTO "AttackEffectDamageType" ("attackEffectId", "damageTypeId")
SELECT ae."id", dt."id"
FROM "AttackEffect" ae
JOIN "DamageType" dt ON lower(dt."name") = 'slashing'
WHERE lower(ae."name") = 'laceration'
ON CONFLICT DO NOTHING;

INSERT INTO "AttackEffectDamageType" ("attackEffectId", "damageTypeId")
SELECT ae."id", dt."id"
FROM "AttackEffect" ae
JOIN "DamageType" dt ON lower(dt."name") = 'fire'
WHERE lower(ae."name") = 'immolate'
ON CONFLICT DO NOTHING;

INSERT INTO "AttackEffectDamageType" ("attackEffectId", "damageTypeId")
SELECT ae."id", dt."id"
FROM "AttackEffect" ae
JOIN "DamageType" dt ON lower(dt."name") = 'holy'
WHERE lower(ae."name") = 'smite'
ON CONFLICT DO NOTHING;

INSERT INTO "AttackEffectDamageType" ("attackEffectId", "damageTypeId")
SELECT ae."id", dt."id"
FROM "AttackEffect" ae
JOIN "DamageType" dt ON lower(dt."name") = 'ice'
WHERE lower(ae."name") = 'freeze'
ON CONFLICT DO NOTHING;

INSERT INTO "AttackEffectDamageType" ("attackEffectId", "damageTypeId")
SELECT ae."id", dt."id"
FROM "AttackEffect" ae
JOIN "DamageType" dt ON lower(dt."name") = 'lightning'
WHERE lower(ae."name") = 'surge'
ON CONFLICT DO NOTHING;

INSERT INTO "AttackEffectDamageType" ("attackEffectId", "damageTypeId")
SELECT ae."id", dt."id"
FROM "AttackEffect" ae
JOIN "DamageType" dt ON lower(dt."name") = 'necrotic'
WHERE lower(ae."name") = 'disease'
ON CONFLICT DO NOTHING;

INSERT INTO "AttackEffectDamageType" ("attackEffectId", "damageTypeId")
SELECT ae."id", dt."id"
FROM "AttackEffect" ae
JOIN "DamageType" dt ON lower(dt."name") = 'poison'
WHERE lower(ae."name") = 'poisoned'
ON CONFLICT DO NOTHING;

INSERT INTO "AttackEffectDamageType" ("attackEffectId", "damageTypeId")
SELECT ae."id", dt."id"
FROM "AttackEffect" ae
JOIN "DamageType" dt ON lower(dt."name") = 'psychic'
WHERE lower(ae."name") = 'overwhelmed'
ON CONFLICT DO NOTHING;

INSERT INTO "AttackEffectDamageType" ("attackEffectId", "damageTypeId")
SELECT ae."id", dt."id"
FROM "AttackEffect" ae
JOIN "DamageType" dt ON lower(dt."name") = 'piercing'
WHERE lower(ae."name") = 'penetrate'
ON CONFLICT DO NOTHING;

INSERT INTO "AttackEffectDamageType" ("attackEffectId", "damageTypeId")
SELECT ae."id", dt."id"
FROM "AttackEffect" ae
JOIN "DamageType" dt ON lower(dt."name") = 'fear'
WHERE lower(ae."name") = 'horrified'
ON CONFLICT DO NOTHING;
