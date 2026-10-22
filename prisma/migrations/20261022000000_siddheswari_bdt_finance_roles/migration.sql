-- Siddheswari College: introduce explicit finance-office roles and make new fee records BDT by default.
-- Existing rows are deliberately not rewritten: historical financial records must preserve their recorded currency.
ALTER TYPE "CampusRole" ADD VALUE IF NOT EXISTS 'ACCOUNTANT';
ALTER TYPE "CampusRole" ADD VALUE IF NOT EXISTS 'OFFICE_STAFF';
ALTER TYPE "CampusRole" ADD VALUE IF NOT EXISTS 'HR';
ALTER TABLE "FeeRecord" ALTER COLUMN "currency" SET DEFAULT 'BDT';
