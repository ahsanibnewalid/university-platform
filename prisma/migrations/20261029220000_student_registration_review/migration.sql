CREATE TYPE "StudentRegistrationStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "StudentProfile"
  ADD COLUMN "registrationStatus" "StudentRegistrationStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  ADD COLUMN "registrationRequestedAt" TIMESTAMP(3),
  ADD COLUMN "registrationReviewedAt" TIMESTAMP(3),
  ADD COLUMN "registrationReviewedById" TEXT;

-- Preserve the state of students who activated successfully before this release.
UPDATE "StudentProfile" AS student
SET "registrationStatus" = 'APPROVED'
WHERE EXISTS (
  SELECT 1 FROM "Membership" AS membership
  WHERE membership."userId" = student."userId"
    AND membership."role" IN ('STUDENT', 'MEDICAL_STUDENT', 'LAW_STUDENT')
    AND membership."status" = 'ACTIVE'
);

CREATE INDEX "StudentProfile_registrationStatus_registrationRequestedAt_idx"
  ON "StudentProfile"("registrationStatus", "registrationRequestedAt");
