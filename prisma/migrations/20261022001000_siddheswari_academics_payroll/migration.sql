-- Academic enrollment, session, transcript, payroll, and payment audit models for Siddheswari College.
CREATE TYPE "ProgramType" AS ENUM ('HSC', 'HONOURS', 'DEGREE', 'PROFESSIONAL_HONOURS', 'MASTERS');
CREATE TYPE "AcademicSessionStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');
CREATE TYPE "ProgramEnrollmentStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'COMPLETED', 'WITHDRAWN');
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('OPEN', 'LOCKED', 'CLOSED');
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'CALCULATED', 'LOCKED', 'PAID', 'CANCELLED');
CREATE TYPE "PayrollAdjustmentType" AS ENUM ('ALLOWANCE', 'DEDUCTION');
CREATE TYPE "PayslipStatus" AS ENUM ('GENERATED', 'APPROVED', 'PAID', 'VOID');

ALTER TABLE "Program" ADD COLUMN "programType" "ProgramType" NOT NULL DEFAULT 'HONOURS';
UPDATE "Program" SET "programType" = 'PROFESSIONAL_HONOURS'
 WHERE lower("name") LIKE '%professional%honours%' OR lower("level") LIKE '%professional%honours%';
UPDATE "Program" SET "programType" = 'HSC'
 WHERE lower("name") LIKE '%hsc%' OR lower("level") LIKE '%hsc%' OR lower("level") LIKE '%higher secondary%';
UPDATE "Program" SET "programType" = 'MASTERS'
 WHERE lower("name") LIKE '%master%' OR lower("level") LIKE '%master%';
UPDATE "Program" SET "programType" = 'DEGREE'
 WHERE lower("name") LIKE '%degree%' OR lower("level") LIKE '%degree%';

CREATE TABLE "AcademicSession" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "programId" TEXT,
  "name" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "AcademicSessionStatus" NOT NULL DEFAULT 'PLANNED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentAcademicEnrollment" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "academicSessionId" TEXT NOT NULL,
  "batchId" TEXT,
  "admissionNumber" TEXT NOT NULL,
  "nuRegistrationNumber" TEXT,
  "status" "ProgramEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentAcademicEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GradePoint" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "programType" "ProgramType" NOT NULL,
  "letterGrade" TEXT NOT NULL,
  "minimumPercentage" DECIMAL(5,2) NOT NULL,
  "maximumPercentage" DECIMAL(5,2) NOT NULL,
  "gradePoint" DECIMAL(4,2) NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GradePoint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GradePoint_percentage_range_check" CHECK ("minimumPercentage" >= 0 AND "maximumPercentage" <= 100 AND "minimumPercentage" <= "maximumPercentage"),
  CONSTRAINT "GradePoint_grade_point_check" CHECK ("gradePoint" >= 0 AND "gradePoint" <= 5)
);

CREATE TABLE "TranscriptResult" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "academicSessionId" TEXT,
  "cumulativeGpa" DECIMAL(4,2) NOT NULL,
  "totalCredits" DECIMAL(7,2) NOT NULL,
  "letterGrade" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TranscriptResult_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TranscriptResult_gpa_check" CHECK ("cumulativeGpa" >= 0 AND "cumulativeGpa" <= 5),
  CONSTRAINT "TranscriptResult_credits_check" CHECK ("totalCredits" >= 0)
);

CREATE TABLE "EmployeeProfile" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "employeeNumber" TEXT NOT NULL,
  "jobTitle" TEXT NOT NULL,
  "departmentId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "hiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalaryStructure" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "employeeProfileId" TEXT NOT NULL,
  "baseSalary" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BDT',
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveUntil" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalaryStructure_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalaryStructure_base_salary_check" CHECK ("baseSalary" >= 0),
  CONSTRAINT "SalaryStructure_currency_check" CHECK ("currency" = 'BDT'),
  CONSTRAINT "SalaryStructure_effective_dates_check" CHECK ("effectiveUntil" IS NULL OR "effectiveUntil" >= "effectiveFrom")
);

CREATE TABLE "PayrollPeriod" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'OPEN',
  "lockedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayrollPeriod_dates_check" CHECK ("endsAt" >= "startsAt")
);

CREATE TABLE "PayrollRun" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "periodId" TEXT NOT NULL,
  "runNumber" INTEGER NOT NULL,
  "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
  "totalGross" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalDeductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalNet" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'BDT',
  "createdById" TEXT NOT NULL,
  "lockedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayrollRun_currency_check" CHECK ("currency" = 'BDT'),
  CONSTRAINT "PayrollRun_totals_check" CHECK ("totalGross" >= 0 AND "totalDeductions" >= 0 AND "totalNet" >= 0)
);

CREATE TABLE "PayrollAdjustment" (
  "id" TEXT NOT NULL,
  "employeeProfileId" TEXT NOT NULL,
  "periodId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "type" "PayrollAdjustmentType" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayrollAdjustment_amount_check" CHECK ("amount" > 0)
);

CREATE TABLE "Payslip" (
  "id" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "employeeProfileId" TEXT NOT NULL,
  "salaryStructureId" TEXT NOT NULL,
  "grossSalary" DECIMAL(12,2) NOT NULL,
  "allowances" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "netSalary" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BDT',
  "breakdown" JSONB NOT NULL,
  "status" "PayslipStatus" NOT NULL DEFAULT 'GENERATED',
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payslip_currency_check" CHECK ("currency" = 'BDT'),
  CONSTRAINT "Payslip_amounts_check" CHECK ("grossSalary" >= 0 AND "allowances" >= 0 AND "deductions" >= 0 AND "netSalary" >= 0),
  CONSTRAINT "Payslip_net_check" CHECK ("netSalary" = "grossSalary" - "deductions")
);

CREATE TABLE "SSLCommerzLog" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "transactionId" TEXT,
  "validationId" TEXT,
  "eventType" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "payloadHash" TEXT,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SSLCommerzLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcademicSession_institutionId_name_key" ON "AcademicSession"("institutionId", "name");
CREATE INDEX "AcademicSession_institutionId_status_startsAt_idx" ON "AcademicSession"("institutionId", "status", "startsAt");
CREATE INDEX "AcademicSession_programId_status_idx" ON "AcademicSession"("programId", "status");
CREATE UNIQUE INDEX "StudentAcademicEnrollment_admissionNumber_key" ON "StudentAcademicEnrollment"("admissionNumber");
CREATE UNIQUE INDEX "StudentAcademicEnrollment_nuRegistrationNumber_key" ON "StudentAcademicEnrollment"("nuRegistrationNumber");
CREATE UNIQUE INDEX "StudentAcademicEnrollment_studentId_programId_academicSessionId_key" ON "StudentAcademicEnrollment"("studentId", "programId", "academicSessionId");
CREATE INDEX "StudentAcademicEnrollment_institutionId_programId_status_idx" ON "StudentAcademicEnrollment"("institutionId", "programId", "status");
CREATE INDEX "StudentAcademicEnrollment_studentId_status_idx" ON "StudentAcademicEnrollment"("studentId", "status");
CREATE INDEX "StudentAcademicEnrollment_academicSessionId_status_idx" ON "StudentAcademicEnrollment"("academicSessionId", "status");
CREATE UNIQUE INDEX "GradePoint_institutionId_programType_letterGrade_key" ON "GradePoint"("institutionId", "programType", "letterGrade");
CREATE INDEX "GradePoint_institutionId_programType_minimumPercentage_maximumPercentage_idx" ON "GradePoint"("institutionId", "programType", "minimumPercentage", "maximumPercentage");
CREATE UNIQUE INDEX "TranscriptResult_studentId_programId_academicYearId_key" ON "TranscriptResult"("studentId", "programId", "academicYearId");
CREATE INDEX "TranscriptResult_institutionId_publishedAt_idx" ON "TranscriptResult"("institutionId", "publishedAt");
CREATE INDEX "TranscriptResult_studentId_publishedAt_idx" ON "TranscriptResult"("studentId", "publishedAt");
CREATE UNIQUE INDEX "EmployeeProfile_userId_key" ON "EmployeeProfile"("userId");
CREATE UNIQUE INDEX "EmployeeProfile_institutionId_employeeNumber_key" ON "EmployeeProfile"("institutionId", "employeeNumber");
CREATE INDEX "EmployeeProfile_institutionId_active_jobTitle_idx" ON "EmployeeProfile"("institutionId", "active", "jobTitle");
CREATE INDEX "EmployeeProfile_departmentId_idx" ON "EmployeeProfile"("departmentId");
CREATE UNIQUE INDEX "SalaryStructure_employeeProfileId_effectiveFrom_key" ON "SalaryStructure"("employeeProfileId", "effectiveFrom");
CREATE INDEX "SalaryStructure_institutionId_active_effectiveFrom_idx" ON "SalaryStructure"("institutionId", "active", "effectiveFrom");
CREATE UNIQUE INDEX "PayrollPeriod_institutionId_name_key" ON "PayrollPeriod"("institutionId", "name");
CREATE INDEX "PayrollPeriod_institutionId_status_startsAt_idx" ON "PayrollPeriod"("institutionId", "status", "startsAt");
CREATE UNIQUE INDEX "PayrollRun_periodId_runNumber_key" ON "PayrollRun"("periodId", "runNumber");
CREATE INDEX "PayrollRun_institutionId_status_createdAt_idx" ON "PayrollRun"("institutionId", "status", "createdAt");
CREATE INDEX "PayrollAdjustment_periodId_employeeProfileId_idx" ON "PayrollAdjustment"("periodId", "employeeProfileId");
CREATE UNIQUE INDEX "Payslip_payrollRunId_employeeProfileId_key" ON "Payslip"("payrollRunId", "employeeProfileId");
CREATE INDEX "Payslip_employeeProfileId_createdAt_idx" ON "Payslip"("employeeProfileId", "createdAt");
CREATE INDEX "SSLCommerzLog_institutionId_createdAt_idx" ON "SSLCommerzLog"("institutionId", "createdAt");
CREATE INDEX "SSLCommerzLog_transactionId_createdAt_idx" ON "SSLCommerzLog"("transactionId", "createdAt");
CREATE INDEX "SSLCommerzLog_validationId_idx" ON "SSLCommerzLog"("validationId");

ALTER TABLE "AcademicSession" ADD CONSTRAINT "AcademicSession_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademicSession" ADD CONSTRAINT "AcademicSession_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentAcademicEnrollment" ADD CONSTRAINT "StudentAcademicEnrollment_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentAcademicEnrollment" ADD CONSTRAINT "StudentAcademicEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentAcademicEnrollment" ADD CONSTRAINT "StudentAcademicEnrollment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentAcademicEnrollment" ADD CONSTRAINT "StudentAcademicEnrollment_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentAcademicEnrollment" ADD CONSTRAINT "StudentAcademicEnrollment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GradePoint" ADD CONSTRAINT "GradePoint_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TranscriptResult" ADD CONSTRAINT "TranscriptResult_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TranscriptResult" ADD CONSTRAINT "TranscriptResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TranscriptResult" ADD CONSTRAINT "TranscriptResult_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TranscriptResult" ADD CONSTRAINT "TranscriptResult_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TranscriptResult" ADD CONSTRAINT "TranscriptResult_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalaryStructure" ADD CONSTRAINT "SalaryStructure_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryStructure" ADD CONSTRAINT "SalaryStructure_employeeProfileId_fkey" FOREIGN KEY ("employeeProfileId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_employeeProfileId_fkey" FOREIGN KEY ("employeeProfileId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeProfileId_fkey" FOREIGN KEY ("employeeProfileId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_salaryStructureId_fkey" FOREIGN KEY ("salaryStructureId") REFERENCES "SalaryStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SSLCommerzLog" ADD CONSTRAINT "SSLCommerzLog_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SSLCommerzLog" ADD CONSTRAINT "SSLCommerzLog_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction"("transactionId") ON DELETE SET NULL ON UPDATE CASCADE;
