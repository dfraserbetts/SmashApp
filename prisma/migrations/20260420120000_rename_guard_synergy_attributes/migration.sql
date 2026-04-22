ALTER TYPE "CoreAttribute" RENAME VALUE 'DEFENCE' TO 'GUARD';
ALTER TYPE "CoreAttribute" RENAME VALUE 'SUPPORT' TO 'SYNERGY';

ALTER TABLE "Monster" RENAME COLUMN "defenceDie" TO "guardDie";
ALTER TABLE "Monster" RENAME COLUMN "defenceResistDie" TO "guardResistDie";
ALTER TABLE "Monster" RENAME COLUMN "defenceModifier" TO "guardModifier";
ALTER TABLE "Monster" RENAME COLUMN "supportDie" TO "synergyDie";
ALTER TABLE "Monster" RENAME COLUMN "supportResistDie" TO "synergyResistDie";
ALTER TABLE "Monster" RENAME COLUMN "supportModifier" TO "synergyModifier";

ALTER TABLE "CombatTuning" RENAME COLUMN "defenceWeight" TO "guardWeight";
ALTER TABLE "CombatTuning" RENAME COLUMN "supportWeight" TO "synergyWeight";
ALTER TABLE "CombatTuning" RENAME COLUMN "armorSkillDefenceWeight" TO "armorSkillGuardWeight";
ALTER TABLE "CombatTuning" RENAME COLUMN "willpowerSupportWeight" TO "willpowerSynergyWeight";

WITH key_map(old_key, new_key) AS (
  VALUES
    ('defenceWeight', 'guardWeight'),
    ('supportWeight', 'synergyWeight'),
    ('armorSkillDefenceWeight', 'armorSkillGuardWeight'),
    ('willpowerSupportWeight', 'willpowerSynergyWeight'),
    ('dodgeDefenceWeight', 'dodgeGuardWeight')
)
DELETE FROM "CombatTuningConfigEntry" AS legacy
USING "CombatTuningConfigEntry" AS canonical, key_map
WHERE legacy."configSetId" = canonical."configSetId"
  AND legacy."configKey" = key_map.old_key
  AND canonical."configKey" = key_map.new_key;

WITH key_map(old_key, new_key) AS (
  VALUES
    ('defenceWeight', 'guardWeight'),
    ('supportWeight', 'synergyWeight'),
    ('armorSkillDefenceWeight', 'armorSkillGuardWeight'),
    ('willpowerSupportWeight', 'willpowerSynergyWeight'),
    ('dodgeDefenceWeight', 'dodgeGuardWeight')
)
UPDATE "CombatTuningConfigEntry" AS entry
SET "configKey" = key_map.new_key
FROM key_map
WHERE entry."configKey" = key_map.old_key;
