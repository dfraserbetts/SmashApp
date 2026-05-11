-- CreateTable
CREATE TABLE "CharacterBuilderTuning" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "playerPowerSpendScalar" DOUBLE PRECISION NOT NULL DEFAULT 3,

    CONSTRAINT "CharacterBuilderTuning_pkey" PRIMARY KEY ("id")
);

