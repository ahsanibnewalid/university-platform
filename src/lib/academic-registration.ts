import { EnrollmentStatus, Prisma, ProgramEnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthenticationError } from "@/lib/auth";

export type AcademicRegistrationResult = {
  programEnrollmentId: string;
  studentId: string;
  registeredSectionIds: string[];
  reactivatedSectionIds: string[];
};

/**
 * Registers a student in explicitly selected sections only. It never guesses a
 * curriculum or silently enrolls the student in every course for a programme.
 */
export async function registerStudentForCourseSections(input: {
  institutionId: string;
  programEnrollmentId: string;
  actorId: string;
  sectionIds: string[];
}): Promise<AcademicRegistrationResult> {
  const sectionIds = [...new Set(input.sectionIds.map((id) => id.trim()).filter(Boolean))];
  if (sectionIds.length === 0 || sectionIds.length !== input.sectionIds.length) {
    throw new AuthenticationError("Choose one or more unique course sections.", 400);
  }
  if (sectionIds.length > 30) {
    throw new AuthenticationError("A registration request may contain at most 30 sections.", 400);
  }

  return prisma.$transaction(async (tx) => {
    const programEnrollment = await tx.studentAcademicEnrollment.findFirst({
      where: {
        id: input.programEnrollmentId,
        institutionId: input.institutionId,
        status: ProgramEnrollmentStatus.ACTIVE,
      },
      include: { academicSession: true, program: true },
    });
    if (!programEnrollment) {
      throw new AuthenticationError("An active programme enrollment is required.", 404);
    }
    const sections = await tx.courseSection.findMany({
      where: {
        id: { in: sectionIds },
        course: { programId: programEnrollment.programId },
        term: {
          institutionId: input.institutionId,
          status: "ACTIVE",
          startsAt: { lte: programEnrollment.academicSession.endsAt },
          endsAt: { gte: programEnrollment.academicSession.startsAt },
        },
      },
      include: {
        course: { select: { id: true, code: true, title: true } },
        term: { select: { id: true, name: true } },
        _count: { select: { enrollments: { where: { status: EnrollmentStatus.ENROLLED } } } },
        enrollments: {
          where: { studentId: programEnrollment.studentId },
          select: { id: true, status: true },
        },
      },
    });
    if (sections.length !== sectionIds.length) {
      throw new AuthenticationError(
        "One or more sections are not active for this programme and academic session.",
        400,
      );
    }

    for (const section of sections) {
      const alreadyEnrolled = section.enrollments[0]?.status === EnrollmentStatus.ENROLLED;
      const isExistingRecord = section.enrollments.length > 0;
      if (!alreadyEnrolled && section.capacity !== null &&
        section._count.enrollments >= section.capacity && !isExistingRecord) {
        throw new AuthenticationError(`Section ${section.sectionCode} has reached capacity.`, 409);
      }
    }

    const registeredSectionIds: string[] = [];
    const reactivatedSectionIds: string[] = [];
    for (const section of sections) {
      const existing = section.enrollments[0];
      if (existing?.status === EnrollmentStatus.ENROLLED) {
        registeredSectionIds.push(section.id);
        continue;
      }
      await tx.enrollment.upsert({
        where: { sectionId_studentId: { sectionId: section.id, studentId: programEnrollment.studentId } },
        create: {
          sectionId: section.id,
          studentId: programEnrollment.studentId,
          status: EnrollmentStatus.ENROLLED,
        },
        update: {
          status: EnrollmentStatus.ENROLLED,
          enrolledAt: new Date(),
        },
      });
      if (existing) reactivatedSectionIds.push(section.id);
      else registeredSectionIds.push(section.id);
    }

    await tx.auditEvent.create({
      data: {
        institutionId: input.institutionId,
        actorId: input.actorId,
        action: "academic.course_sections.registered",
        entityType: "StudentAcademicEnrollment",
        entityId: programEnrollment.id,
        metadata: {
          programId: programEnrollment.programId,
          academicSessionId: programEnrollment.academicSessionId,
          sectionIds,
          reactivatedSectionIds,
        },
      },
    });

    return {
      programEnrollmentId: programEnrollment.id,
      studentId: programEnrollment.studentId,
      registeredSectionIds,
      reactivatedSectionIds,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
