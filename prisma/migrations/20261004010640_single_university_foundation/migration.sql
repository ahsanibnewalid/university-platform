-- CreateEnum
CREATE TYPE "AcademicYearStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "StudentAcademicStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'GRADUATED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CampusRole" ADD VALUE 'REGISTRAR';
ALTER TYPE "CampusRole" ADD VALUE 'EXAM_CONTROLLER';
ALTER TYPE "CampusRole" ADD VALUE 'FINANCE_ADMIN';
ALTER TYPE "CampusRole" ADD VALUE 'DEPARTMENT_HEAD';
ALTER TYPE "CampusRole" ADD VALUE 'TEACHER';
ALTER TYPE "CampusRole" ADD VALUE 'STAFF';
ALTER TYPE "CampusRole" ADD VALUE 'LIBRARIAN';
ALTER TYPE "CampusRole" ADD VALUE 'HOSTEL_MANAGER';
ALTER TYPE "CampusRole" ADD VALUE 'TRANSPORT_MANAGER';
ALTER TYPE "CampusRole" ADD VALUE 'STUDENT_AFFAIRS';

-- AlterTable
ALTER TABLE "Institution" ADD COLUMN     "singletonKey" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "facultyId" TEXT;

-- AlterTable
ALTER TABLE "AcademicTerm" ADD COLUMN     "academicYearId" TEXT;

-- AlterTable
ALTER TABLE "ClassMeeting" ADD COLUMN     "classroomId" TEXT;

-- CreateTable
CREATE TABLE "Faculty" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Faculty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "expectedGraduationYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "userId" TEXT NOT NULL,
    "studentNumber" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "batchId" TEXT,
    "currentTermId" TEXT,
    "phone" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "address" TEXT,
    "admissionDate" TIMESTAMP(3),
    "academicStatus" "StudentAcademicStatus" NOT NULL DEFAULT 'ACTIVE',
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "TeacherProfile" (
    "userId" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "departmentId" TEXT,
    "phone" TEXT,
    "office" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ParentProfile" (
    "userId" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "userId" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "departmentId" TEXT,
    "jobTitle" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AcademicYearStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Classroom" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "building" TEXT,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Classroom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSchedule" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "classroomId" TEXT,
    "weekday" "Weekday" NOT NULL,
    "startsAt" TEXT NOT NULL,
    "endsAt" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),

    CONSTRAINT "ClassSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Faculty_institutionId_name_idx" ON "Faculty"("institutionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Faculty_institutionId_code_key" ON "Faculty"("institutionId", "code");

-- CreateIndex
CREATE INDEX "Batch_programId_startYear_idx" ON "Batch"("programId", "startYear");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_programId_name_key" ON "Batch"("programId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_studentNumber_key" ON "StudentProfile"("studentNumber");

-- CreateIndex
CREATE INDEX "StudentProfile_programId_academicStatus_idx" ON "StudentProfile"("programId", "academicStatus");

-- CreateIndex
CREATE INDEX "StudentProfile_batchId_academicStatus_idx" ON "StudentProfile"("batchId", "academicStatus");

-- CreateIndex
CREATE INDEX "StudentProfile_currentTermId_idx" ON "StudentProfile"("currentTermId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherProfile_employeeNumber_key" ON "TeacherProfile"("employeeNumber");

-- CreateIndex
CREATE INDEX "TeacherProfile_departmentId_idx" ON "TeacherProfile"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_employeeNumber_key" ON "StaffProfile"("employeeNumber");

-- CreateIndex
CREATE INDEX "StaffProfile_departmentId_idx" ON "StaffProfile"("departmentId");

-- CreateIndex
CREATE INDEX "AcademicYear_institutionId_status_idx" ON "AcademicYear"("institutionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_institutionId_name_key" ON "AcademicYear"("institutionId", "name");

-- CreateIndex
CREATE INDEX "Classroom_institutionId_building_idx" ON "Classroom"("institutionId", "building");

-- CreateIndex
CREATE UNIQUE INDEX "Classroom_institutionId_code_key" ON "Classroom"("institutionId", "code");

-- CreateIndex
CREATE INDEX "ClassSchedule_sectionId_weekday_startsAt_idx" ON "ClassSchedule"("sectionId", "weekday", "startsAt");

-- CreateIndex
CREATE INDEX "ClassSchedule_classroomId_weekday_startsAt_idx" ON "ClassSchedule"("classroomId", "weekday", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Institution_singletonKey_key" ON "Institution"("singletonKey");

-- CreateIndex
CREATE INDEX "Department_facultyId_name_idx" ON "Department"("facultyId", "name");

-- CreateIndex
CREATE INDEX "AcademicTerm_academicYearId_idx" ON "AcademicTerm"("academicYearId");

-- CreateIndex
CREATE INDEX "ClassMeeting_classroomId_startsAt_idx" ON "ClassMeeting"("classroomId", "startsAt");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Faculty" ADD CONSTRAINT "Faculty_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_currentTermId_fkey" FOREIGN KEY ("currentTermId") REFERENCES "AcademicTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentProfile" ADD CONSTRAINT "ParentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicTerm" ADD CONSTRAINT "AcademicTerm_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassMeeting" ADD CONSTRAINT "ClassMeeting_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSchedule" ADD CONSTRAINT "ClassSchedule_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CourseSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSchedule" ADD CONSTRAINT "ClassSchedule_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
