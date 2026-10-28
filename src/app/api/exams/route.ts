import { CampusRole, EnrollmentStatus, ExamModerationStatus, Prisma } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import {
  courseTeachingRoles,
  departmentRoles,
  examManagementRoles,
  readJsonObject,
  recordAudit,
  requiredText,
  studentRoles,
  validDate,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession([
      ...studentRoles,
      CampusRole.PARENT,
      ...examManagementRoles,
    ]);
    const { role } = session.membership;
    const student = studentRoles.includes(role);
    const parent = role === CampusRole.PARENT;
    if (student) {
      const profile = await prisma.studentProfile.findFirst({
        where: {
          userId: session.userId,
          user: {
            memberships: {
              some: {
                institutionId: session.membership.institutionId,
                status: "ACTIVE",
                role: { in: studentRoles },
              },
            },
          },
        },
        select: { userId: true },
      });
      if (!profile) throw new AuthenticationError("An active student profile is required to view exams and results.", 403);
    }
    const parentProfiles = parent
      ? await prisma.studentProfile.findMany({
          where: {
            user: {
              memberships: {
                some: {
                  institutionId: session.membership.institutionId,
                  status: "ACTIVE",
                  role: { in: studentRoles },
                },
              },
              studentGuardians: {
                some: { guardianId: session.userId, verifiedAt: { not: null } },
              },
            },
          },
          select: { userId: true },
        })
      : [];
    const parentStudentIds = parentProfiles.map((profile) => profile.userId);
    const exams = await prisma.exam.findMany({
      where: {
        section: {
          term: { institutionId: session.membership.institutionId },
          ...(student
            ? {
                enrollments: {
                  some: {
                    studentId: session.userId,
                    status: EnrollmentStatus.ENROLLED,
                  },
                },
              }
            : parent
              ? {
                  enrollments: {
                    some: {
                      studentId: { in: parentStudentIds },
                      status: EnrollmentStatus.ENROLLED,
                    },
                  },
                }
              : courseTeachingRoles.includes(role)
                ? { instructors: { some: { userId: session.userId } } }
                : departmentRoles.includes(role)
                  ? { course: { department: { chairId: session.userId } } }
                  : {}),
        },
      },
      include: {
        section: { include: {
          course: { select: { code: true, title: true } },
          ...(!student && !parent ? {
            enrollments: {
              where: { status: EnrollmentStatus.ENROLLED },
              select: { studentId: true, student: { select: { name: true } } },
            },
          } : {}),
        } },
        results: student
          ? { where: { studentId: session.userId, releasedAt: { not: null } } }
          : parent
            ? {
                where: {
                  studentId: { in: parentStudentIds },
                  releasedAt: { not: null },
                },
              }
            : { select: { studentId: true, points: true, releasedAt: true, moderationStatus: true, gradedById: true, moderatedById: true, moderatedAt: true } },
      },
      orderBy: { startsAt: "asc" },
      take: 100,
    });
    return Response.json({ exams });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(examManagementRoles);
    const input = await readJsonObject(request);
    const sectionId = requiredText(input.sectionId, "Course section", 1, 100);
    const title = requiredText(input.title, "Exam title", 2, 160);
    const startsAt = validDate(input.startsAt, "Exam time");
    const maxPoints =
      typeof input.maxPoints === "number" &&
      Number.isFinite(input.maxPoints) &&
      input.maxPoints > 0 &&
      input.maxPoints <= 100000
        ? input.maxPoints
        : 0;
    if (!maxPoints) throw new AuthenticationError("Maximum points must be greater than zero.", 400);
    const section = await prisma.courseSection.findFirst({
      where: {
        id: sectionId,
        term: { institutionId: session.membership.institutionId },
        ...(courseTeachingRoles.includes(session.membership.role)
          ? { instructors: { some: { userId: session.userId } } }
          : departmentRoles.includes(session.membership.role)
            ? { course: { department: { chairId: session.userId } } }
            : {}),
      },
      select: { id: true },
    });
    if (!section) throw new AuthenticationError("Course section not found.", 404);
    const exam = await prisma.exam.create({ data: { sectionId, title, startsAt, maxPoints } });
    await recordAudit(session, "academic.exam.created", "Exam", exam.id);
    return Response.json({ exam }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(examManagementRoles);
    const input = await readJsonObject(request);
    if (input.release === true) {
      throw new AuthenticationError("Grades must be submitted, independently moderated and published through the moderation workflow.", 400);
    }
    const examId = requiredText(input.examId, "Exam", 1, 100);
    const studentId = requiredText(input.studentId, "Student", 1, 100);
    const points =
      typeof input.points === "number" &&
      Number.isFinite(input.points) &&
      input.points >= 0
        ? input.points
        : -1;
    if (points < 0) throw new AuthenticationError("Result points must be zero or higher.", 400);
    const studentProfile = await prisma.studentProfile.findFirst({
      where: {
        userId: studentId,
        user: {
          memberships: {
            some: {
              institutionId: session.membership.institutionId,
              status: "ACTIVE",
              role: { in: studentRoles },
            },
          },
        },
      },
      select: { userId: true },
    });
    if (!studentProfile) throw new AuthenticationError("Active student profile not found.", 404);
    const exam = await prisma.exam.findFirst({
      where: {
        id: examId,
        section: {
          term: { institutionId: session.membership.institutionId },
          ...(courseTeachingRoles.includes(session.membership.role)
            ? { instructors: { some: { userId: session.userId } } }
            : departmentRoles.includes(session.membership.role)
              ? { course: { department: { chairId: session.userId } } }
              : {}),
          enrollments: { some: { studentId, status: EnrollmentStatus.ENROLLED } },
        },
      },
      select: { id: true, maxPoints: true },
    });
    if (!exam) throw new AuthenticationError("Exam or enrolled student not found.", 404);
    if (points > exam.maxPoints.toNumber()) {
      throw new AuthenticationError("Points cannot exceed the exam maximum.", 400);
    }
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.examResult.findUnique({ where: { examId_studentId: { examId, studentId } } });
      if (existing?.releasedAt || (existing && !([ExamModerationStatus.DRAFT, ExamModerationStatus.RETURNED] as ExamModerationStatus[]).includes(existing.moderationStatus))) {
        throw new AuthenticationError("Submitted, approved and published marks cannot be edited. Ask the exam controller to return the batch.", 409);
      }
      const saved = await tx.examResult.upsert({
        where: { examId_studentId: { examId, studentId } },
        create: { examId, studentId, points, gradedById: session.userId },
        update: { points, gradedById: session.userId, moderationStatus: ExamModerationStatus.DRAFT, moderatedAt: null, moderatedById: null },
      });
      await tx.auditEvent.create({ data: {
        institutionId: session.membership.institutionId, actorId: session.userId,
        action: "academic.exam.graded", entityType: "ExamResult", entityId: `${examId}:${studentId}`,
      } });
      return saved;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ result });
  } catch (error) {
    return authErrorResponse(error);
  }
}
