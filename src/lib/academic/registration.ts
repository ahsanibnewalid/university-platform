import {
  EnrollmentStatus,
  ProgramEnrollmentStatus,
  AcademicSessionStatus,
  AcademicTermStatus,
  Prisma,
} from "@prisma/client";
import { AuthenticationError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Registrar-triggered mapping; section IDs are derived server-side from the enrolled program. */
export async function registerProgramEnrollmentInActiveSections(programEnrollmentId: string, institutionId: string) {
  return prisma.$transaction(async (tx) => {
    const enrollment = await tx.studentAcademicEnrollment.findFirst({
      where: { id: programEnrollmentId, institutionId, status: ProgramEnrollmentStatus.ACTIVE, academicSession: { status: AcademicSessionStatus.ACTIVE } },
      include: { program: { select: { id: true } } },
    });
    if (!enrollment) throw new AuthenticationError("An active program enrollment in an active academic session is required.", 409);
    const sections = await tx.courseSection.findMany({
      where: { course: { programId: enrollment.program.id, department: { institutionId } }, term: { institutionId, status: AcademicTermStatus.ACTIVE } },
      include: { _count: { select: { enrollments: { where: { status: EnrollmentStatus.ENROLLED } } } } },
      orderBy: [{ course: { code: "asc" } }, { sectionCode: "asc" }],
    });
    if (!sections.length) throw new AuthenticationError("No course sections are configured for this program in an active academic term.", 409);
    const registeredSectionIds: string[] = [];
    for (const section of sections) {
      if (section.capacity !== null && section._count.enrollments >= section.capacity) {
        throw new AuthenticationError(`Section ${section.sectionCode} is full; no registrations were committed.`, 409);
      }
      await tx.enrollment.upsert({
        where: { sectionId_studentId: { sectionId: section.id, studentId: enrollment.studentId } },
        create: { sectionId: section.id, studentId: enrollment.studentId, status: EnrollmentStatus.ENROLLED },
        update: { status: EnrollmentStatus.ENROLLED, finalGrade: null, gpaPoints: null },
      });
      registeredSectionIds.push(section.id);
    }
    await tx.auditEvent.create({
      data: {
        institutionId, action: "academic.course_sections.registered", entityType: "StudentAcademicEnrollment", entityId: enrollment.id,
        metadata: { studentId: enrollment.studentId, programId: enrollment.programId, academicSessionId: enrollment.academicSessionId, sectionIds: registeredSectionIds, count: registeredSectionIds.length },
      },
    });
    return { studentId: enrollment.studentId, programEnrollmentId, sectionIds: registeredSectionIds, count: registeredSectionIds.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
