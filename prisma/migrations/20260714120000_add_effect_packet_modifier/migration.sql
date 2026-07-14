ALTER TABLE "EffectPacket"
ADD COLUMN "modifier" INTEGER;

ALTER TABLE "EffectPacket"
ADD CONSTRAINT "EffectPacket_modifier_range_and_intention_check"
CHECK (
  "modifier" IS NULL OR (
    "modifier" BETWEEN 1 AND 5
    AND "intention" IN ('AUGMENT', 'DEBUFF')
  )
);
