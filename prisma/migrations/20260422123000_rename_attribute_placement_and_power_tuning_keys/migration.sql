ALTER TYPE "AttributePlacement" RENAME VALUE 'DEFENCE' TO 'GUARD';

UPDATE "PowerTuningConfigEntry"
SET "configKey" = CASE "configKey"
  WHEN 'packet.augmentStat.defence' THEN 'packet.augmentStat.guard'
  WHEN 'packet.augmentStat.support' THEN 'packet.augmentStat.synergy'
  WHEN 'packet.debuffStat.defence' THEN 'packet.debuffStat.guard'
  WHEN 'packet.debuffStat.support' THEN 'packet.debuffStat.synergy'
  ELSE "configKey"
END
WHERE "configKey" IN (
  'packet.augmentStat.defence',
  'packet.augmentStat.support',
  'packet.debuffStat.defence',
  'packet.debuffStat.support'
);
