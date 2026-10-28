CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED');

CREATE TABLE "ParentTeacherAppointment" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "response" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ParentTeacherAppointment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ParentTeacherAppointment_institutionId_status_requestedAt_idx" ON "ParentTeacherAppointment"("institutionId", "status", "requestedAt");
CREATE INDEX "ParentTeacherAppointment_parentId_createdAt_idx" ON "ParentTeacherAppointment"("parentId", "createdAt");
CREATE INDEX "ParentTeacherAppointment_teacherId_status_requestedAt_idx" ON "ParentTeacherAppointment"("teacherId", "status", "requestedAt");
CREATE INDEX "ParentTeacherAppointment_studentId_createdAt_idx" ON "ParentTeacherAppointment"("studentId", "createdAt");

ALTER TABLE "ParentTeacherAppointment" ADD CONSTRAINT "ParentTeacherAppointment_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParentTeacherAppointment" ADD CONSTRAINT "ParentTeacherAppointment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParentTeacherAppointment" ADD CONSTRAINT "ParentTeacherAppointment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParentTeacherAppointment" ADD CONSTRAINT "ParentTeacherAppointment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
