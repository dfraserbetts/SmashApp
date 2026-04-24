CREATE TABLE "MonsterTraitMechanicalEffect" (
  "id" TEXT NOT NULL,
  "traitDefinitionId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "target" TEXT NOT NULL,
  "operation" TEXT NOT NULL DEFAULT 'ADD',
  "valueExpression" TEXT NOT NULL,

  CONSTRAINT "MonsterTraitMechanicalEffect_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MonsterTraitMechanicalEffect_traitDefinitionId_sortOrder_idx"
ON "MonsterTraitMechanicalEffect"("traitDefinitionId", "sortOrder");

ALTER TABLE "MonsterTraitMechanicalEffect"
ADD CONSTRAINT "MonsterTraitMechanicalEffect_traitDefinitionId_fkey"
FOREIGN KEY ("traitDefinitionId")
REFERENCES "MonsterTraitDefinition"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
