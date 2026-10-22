import {
  EnrollmentStatus,
  ProgramEnrollmentStatus,
  AcademicSessionStatus,
  AcademicTermStatus,
} from "@prisma/client";
import { AuthenticationError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Maps an active approved program/session enrollment into the program's course
 * sections for active academic terms at the same institution. This is an
 * explicit registrar-triggered operation; it never trusts client-supplied section IDs.
 */
export async function registerProgramEnrollmentInActiveSections(
  programEnrollmentId: string,
  institutionId: string,
) {
  return prisma.$transaction(async (tx) => {
    const programEnrollment = await tx.studentAcademicEnrollment.findFirst({
      where: {
        id: programEnrollmentId,
        institutionId,
        status: ProgramEnrollmentStatus.ACTIVE,
        academicSession: { status: AcademicSessionStatus.ACTIVE },
      },
      include: { program: { select: { id: true } } },
    });
    if (!programEnrollment) {
      throw new AuthenticationError("An active program enrollment in an active academic session is required.", 409);
    }

    const sections = await tx.courseSection.findMany({
      where: {
        course: {
          programId: programEnrollment.program.id,
          department: { institutionId },
        },
        term: { institutionId, status: AcademicTermStatus.ACTIVE },
      },
      include: { _count: { select: { enrollments: { where: { status: EnrollmentStatus.ENROLLED } } } } },
      orderBy: [{ course: { code: "asc" } }, { sectionCode: "asc" }],
    });
    if (!sections.length) {
      throw new AuthenticationError("No course sections are configured for this program in an active academic term.", 409);
    }

    const registered: string[] = [];
    for (const section of sections) {
      if (section.capacity !== null && section._count.enrollments >= section.capacity) {
        throw new AuthenticationError(`Section ${section.sectionCode} is full; no registrations were committed.`, 409);
      }
      await tx.enrollment.upsert({
        where: { sectionId_studentId: { sectionId: section.id, studentId: programEnrollment.studentId } },
        create: {
          sectionId: section.id,
          studentId: programEnrollment.studentId,
          status: EnrollmentStatus.ENROLLED,
        },
        update: { status: EnrollmentStatus.ENROLLED, finalGrade: null, gpaPoints: null },
      });
      registered.push(section.id);
    }

    await tx.auditEvent.create({
      data: {
        institutionId,
        action: "academic.course_sections.registered",
        entityType: "StudentAcademicEnrollment",
        entityId: programEnrollment.id,
        metadata: {
          studentId: programEnrollment.studentId,
          programId: programEnrollment.programId,
          academicSessionId: programEnrollment.academicSessionId,
          sectionIds: registered,
          count: registered.length,
        },
      },
    });
    return { studentId: programEnrollment.studentId, programEnrollmentId, sectionIds: registered, count: registered.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
