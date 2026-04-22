ALTER TABLE "ArmorAttribute"
ADD COLUMN "pricingMode" TEXT,
ADD COLUMN "pricingScalar" DOUBLE PRECISION;

ALTER TABLE "ShieldAttribute"
ADD COLUMN "pricingMode" TEXT,
ADD COLUMN "pricingScalar" DOUBLE PRECISION;
