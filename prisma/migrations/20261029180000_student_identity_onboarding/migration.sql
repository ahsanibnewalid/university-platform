-- Student email is optional until independently verified.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "StudentProfile"
  ADD COLUMN "activationCodeHash" TEXT,
  ADD COLUMN "activationExpiresAt" TIMESTAMP(3);

CREATE TYPE "IdentityActivationPurpose" AS ENUM ('STAFF_SIGNUP', 'STUDENT_EMAIL');

CREATE TABLE "IdentityActivation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "purpose" "IdentityActivationPurpose" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdentityActivation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdentityActivation_tokenHash_key" ON "IdentityActivation"("tokenHash");
CREATE INDEX "IdentityActivation_userId_purpose_createdAt_idx" ON "IdentityActivation"("userId", "purpose", "createdAt");
CREATE INDEX "IdentityActivation_expiresAt_idx" ON "IdentityActivation"("expiresAt");

ALTER TABLE "IdentityActivation"
  ADD CONSTRAINT "IdentityActivation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
