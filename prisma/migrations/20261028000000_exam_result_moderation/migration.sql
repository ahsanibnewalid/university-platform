-- Keep already-released legacy results visible while preventing new
-- result publication until an independent examiner has approved the batch.
CREATE TYPE "ExamModerationStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'RETURNED');

ALTER TABLE "ExamResult"
  ADD COLUMN "moderationStatus" "ExamModerationStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "gradedById" TEXT,
  ADD COLUMN "moderatedById" TEXT,
  ADD COLUMN "moderatedAt" TIMESTAMP(3);

CREATE INDEX "ExamResult_examId_moderationStatus_releasedAt_idx"
  ON "ExamResult"("examId", "moderationStatus", "releasedAt");
