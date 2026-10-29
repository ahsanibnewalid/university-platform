-- Together with the existing unique singletonKey, this check ensures there
-- can never be more than one institution, even via direct SQL/Prisma writes.
-- Migration intentionally refuses databases with additional institutions;
-- those require a reviewed data migration, never automatic deletion.
ALTER TABLE "Institution"
  ADD CONSTRAINT "Institution_singletonKey_fixed_chk"
  CHECK ("singletonKey" = 1);
