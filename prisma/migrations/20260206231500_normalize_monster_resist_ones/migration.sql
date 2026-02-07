UPDATE "Monster"
SET
  "attackResistDie" = CASE WHEN "attackResistDie" = 1 THEN 0 ELSE "attackResistDie" END,
  "defenceResistDie" = CASE WHEN "defenceResistDie" = 1 THEN 0 ELSE "defenceResistDie" END,
  "fortitudeResistDie" = CASE WHEN "fortitudeResistDie" = 1 THEN 0 ELSE "fortitudeResistDie" END,
  "intellectResistDie" = CASE WHEN "intellectResistDie" = 1 THEN 0 ELSE "intellectResistDie" END,
  "supportResistDie" = CASE WHEN "supportResistDie" = 1 THEN 0 ELSE "supportResistDie" END,
  "braveryResistDie" = CASE WHEN "braveryResistDie" = 1 THEN 0 ELSE "braveryResistDie" END
WHERE
  "attackResistDie" = 1 OR
  "defenceResistDie" = 1 OR
  "fortitudeResistDie" = 1 OR
  "intellectResistDie" = 1 OR
  "supportResistDie" = 1 OR
  "braveryResistDie" = 1;
