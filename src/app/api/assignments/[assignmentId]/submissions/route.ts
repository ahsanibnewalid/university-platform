import { CampusRole, EnrollmentStatus, SubmissionStatus } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { readJsonObject, recordAudit, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ assignmentId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const session = await requireSession([
      CampusRole.STUDENT,
      CampusRole.MEDICAL_STUDENT,
      CampusRole.LAW_STUDENT,
    ]);
    const { assignmentId } = await context.params;
    const input = await readJsonObject(request);
    const content = requiredText(input.content, "Submission", 1, 20000);
    const assignment = await prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        section: {
          term: { institutionId: session.membership.institutionId },
          enrollments: {
            some: { studentId: session.userId, status: EnrollmentStatus.ENROLLED },
          },
        },
      },
      select: { id: true, dueAt: true },
    });
    if (!assignment) {
      throw new AuthenticationError("Assignment not found for your enrolled courses.", 404);
    }
    const submission = await prisma.submission.upsert({
      where: {
        assignmentId_studentId: { assignmentId, studentId: session.userId },
      },
      create: {
        assignmentId,
        studentId: session.userId,
        content,
        status: assignment.dueAt < new Date() ? SubmissionStatus.LATE : SubmissionStatus.SUBMITTED,
      },
      update: {
        content,
        submittedAt: new Date(),
        status: assignment.dueAt < new Date() ? SubmissionStatus.LATE : SubmissionStatus.SUBMITTED,
      },
    });
    await recordAudit(session, "academic.assignment.submitted", "Submission", submission.id);
    return Response.json({ submission }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const session = await requireSession([CampusRole.FACULTY, CampusRole.DEPARTMENT_CHAIR, CampusRole.UNIVERSITY_ADMIN, CampusRole.SUPER_ADMIN]);
    const { assignmentId } = await context.params;
    const input = await readJsonObject(request);
    const studentId = requiredText(input.studentId, "Student", 1, 100);
    const points =
      typeof input.points === "number" && Number.isFinite(input.points) && input.points >= 0
        ? input.points
        : -1;
    if (points < 0) throw new AuthenticationError("Points must be zero or greater.", 400);
    const assignment = await prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        section: {
          term: { institutionId: session.membership.institutionId },
          ...(session.membership.role === CampusRole.FACULTY
            ? { instructors: { some: { userId: session.userId } } }
            : {}),
          enrollments: {
            some: { studentId, status: EnrollmentStatus.ENROLLED },
          },
        },
      },
      select: { id: true, maxPoints: true },
    });
    if (!assignment) throw new AuthenticationError("Assignment or student not found.", 404);
    if (points > assignment.maxPoints.toNumber()) {
      throw new AuthenticationError("Points cannot exceed the assignment maximum.", 400);
    }
    const feedback =
      typeof input.feedback === "string" ? input.feedback.trim().slice(0, 5000) : null;
    const submission = await prisma.submission.update({
      where: { assignmentId_studentId: { assignmentId, studentId } },
      data: { points, feedback, status: SubmissionStatus.GRADED },
    });
    await recordAudit(session, "academic.assignment.graded", "Submission", submission.id);
    return Response.json({ submission });
  } catch (error) {
    return authErrorResponse(error);
  }
}
