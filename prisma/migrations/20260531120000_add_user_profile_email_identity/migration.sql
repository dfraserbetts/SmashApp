ALTER TABLE "UserProfile" ADD COLUMN "email" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "emailNormalized" TEXT;

CREATE UNIQUE INDEX "UserProfile_emailNormalized_key" ON "UserProfile"("emailNormalized");
