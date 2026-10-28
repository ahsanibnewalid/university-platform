import { CampusRole, EnrollmentStatus, ExamModerationStatus, Prisma } from "@prisma/client";
import { assertSameOrigin, AuthenticationError, authErrorResponse, requireSession } from "@/lib/auth";
import { examManagementRoles, readJsonObject, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const reviewerRoles: CampusRole[] = [
  CampusRole.EXAM_CONTROLLER,
  CampusRole.PRINCIPAL,
  CampusRole.REGISTRAR,
  CampusRole.SUPER_ADMIN,
  CampusRole.UNIVERSITY_ADMIN,
];

type ModerationAction = "SUBMIT" | "APPROVE" | "RETURN" | "PUBLISH";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession([...new Set([...examManagementRoles, ...reviewerRoles])]);
    const input = await readJsonObject(request);
    const examId = requiredText(input.examId, "Exam", 1, 100);
    const action = input.action as ModerationAction;
    if (!(["SUBMIT", "APPROVE", "RETURN", "PUBLISH"] as unknown[]).includes(action)) {
      throw new AuthenticationError("Invalid moderation action.", 400);
    }
    const reviewer = reviewerRoles.includes(session.membership.role);
    if (action !== "SUBMIT" && !reviewer) {
      throw new AuthenticationError("Only designated examination authorities may review or publish grades.", 403);
    }
    const note = typeof input.note === "string" ? input.note.trim() : "";
    if (action === "RETURN" && (note.length < 10 || note.length > 1000)) {
      throw new AuthenticationError("A return reason of 10–1000 characters is required.", 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const exam = await tx.exam.findFirst({
        where: {
          id: examId,
          section: {
            term: { institutionId: session.membership.institutionId },
            ...(action === "SUBMIT" && ([CampusRole.TEACHER, CampusRole.FACULTY] as CampusRole[]).includes(session.membership.role)
              ? { instructors: { some: { userId: session.userId } } }
              : action === "SUBMIT" && session.membership.role === CampusRole.DEPARTMENT_HEAD
                ? { course: { department: { chairId: session.userId } } }
                : {}),
          },
        },
        include: {
          results: true,
          section: {
            select: {
              enrollments: { where: { status: EnrollmentStatus.ENROLLED }, select: { studentId: true } },
            },
          },
        },
      });
      if (!exam) throw new AuthenticationError("Exam not found or access denied.", 404);
      const enrolled = new Set(exam.section.enrollments.map((item) => item.studentId));
      if (!enrolled.size || exam.results.length !== enrolled.size || exam.results.some((item) => !enrolled.has(item.studentId))) {
        throw new AuthenticationError("Every currently enrolled student must have a grade before this batch can be moderated.", 409);
      }
      if (exam.results.some((item) => item.releasedAt)) {
        throw new AuthenticationError("Published results are immutable. Use a formal correction process.", 409);
      }
      const expectedStatuses: ExamModerationStatus[] = action === "SUBMIT"
        ? [ExamModerationStatus.DRAFT, ExamModerationStatus.RETURNED]
        : action === "PUBLISH" ? [ExamModerationStatus.APPROVED] : [ExamModerationStatus.PENDING];
      if (exam.results.some((item) => !expectedStatuses.includes(item.moderationStatus))) {
        throw new AuthenticationError("The exam batch is not in the expected moderation state.", 409);
      }
      if (action === "APPROVE" && exam.results.some((item) => !item.gradedById || item.gradedById === session.userId)) {
        throw new AuthenticationError("Every grade needs an identified grader different from its moderator.", 403);
      }
      if (action === "PUBLISH" && exam.results.some((item) => !item.moderatedById)) {
        throw new AuthenticationError("Results must be independently approved before publication.", 409);
      }

      const update = await tx.examResult.updateMany({
        where: { examId, releasedAt: null, moderationStatus: { in: expectedStatuses } },
        data: action === "SUBMIT"
          ? { moderationStatus: ExamModerationStatus.PENDING, moderatedById: null, moderatedAt: null }
          : action === "APPROVE"
            ? { moderationStatus: ExamModerationStatus.APPROVED, moderatedById: session.userId, moderatedAt: new Date() }
            : action === "RETURN"
              ? { moderationStatus: ExamModerationStatus.RETURNED, moderatedById: session.userId, moderatedAt: new Date() }
              : { releasedAt: new Date() },
      });
      if (update.count !== exam.results.length) {
        throw new AuthenticationError("The exam batch changed while it was being reviewed. Refresh and retry.", 409);
      }
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: `academic.exam.moderation.${action.toLowerCase()}`,
          entityType: "Exam",
          entityId: examId,
          metadata: { grades: update.count, ...(action === "RETURN" ? { reason: note } : {}) },
        },
      });
      if (action === "PUBLISH") {
        await tx.notification.createMany({ data: [...enrolled].map((studentId) => ({
          userId: studentId,
          type: "exam.results.published",
          title: "Examination results published",
          body: "An internally moderated college examination result is now available in your portal.",
          link: "/dashboard?module=Coursework",
        })) });
      }
      return { action, examId, processed: update.count };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return Response.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
