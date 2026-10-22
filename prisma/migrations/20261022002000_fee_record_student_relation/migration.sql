-- Add the FK as NOT VALID so legacy orphaned rows do not block deployment.
-- New writes are checked immediately; validate after the preflight orphan query in the rollout runbook.
ALTER TABLE "FeeRecord"
  ADD CONSTRAINT "FeeRecord_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE
  NOT VALID;
