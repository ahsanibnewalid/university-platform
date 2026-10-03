import { CampusRole, EnrollmentStatus } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  requireSession,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const requestedStudent = new URL(request.url).searchParams.get("studentId");
    const studentId = requestedStudent ?? session.userId;
    if (studentId !== session.userId) {
      if (session.membership.role !== CampusRole.PARENT) {
        throw new AuthenticationError("You can only view your own transcript.", 403);
      }
      const guardianLink = await prisma.guardianLink.findFirst({
        where: {
          guardianId: session.userId,
          studentId,
          verifiedAt: { not: null },
          student: {
            memberships: {
              some: {
                institutionId: session.membership.institutionId,
                status: "ACTIVE",
              },
            },
          },
        },
        select: { studentId: true },
      });
      if (!guardianLink) {
        throw new AuthenticationError(
          "A verified guardian link is required to view a transcript.",
          403,
        );
      }
    }
    const student = await prisma.user.findFirst({
      where: {
        id: studentId,
        memberships: {
          some: {
            institutionId: session.membership.institutionId,
            status: "ACTIVE",
            role: {
              in: [CampusRole.STUDENT, CampusRole.MEDICAL_STUDENT, CampusRole.LAW_STUDENT],
            },
          },
        },
      },
      select: { id: true, name: true },
    });
    if (!student) throw new AuthenticationError("Student record not found.", 404);
    const enrollments = await prisma.enrollment.findMany({
      where: {
        studentId,
        status: EnrollmentStatus.COMPLETED,
        section: { term: { institutionId: session.membership.institutionId } },
      },
      include: {
        section: {
          include: {
            course: { select: { code: true, title: true, credits: true } },
            term: { select: { name: true, startsAt: true } },
          },
        },
      },
      orderBy: { section: { term: { startsAt: "asc" } } },
    });
    const gpaValues = enrollments.filter((item) => item.gpaPoints !== null);
    const gpa =
      gpaValues.length === 0
        ? null
        : Math.round(
            (gpaValues.reduce((total, item) => total + item.gpaPoints!.toNumber(), 0) /
              gpaValues.length) *
              100,
          ) / 100;
    const releasedResults = await prisma.examResult.findMany({
      where: {
        studentId,
        releasedAt: { not: null },
        exam: { section: { term: { institutionId: session.membership.institutionId } } },
      },
      include: {
        exam: {
          include: { section: { include: { course: { select: { code: true, title: true } } } } },
        },
      },
      orderBy: { exam: { startsAt: "asc" } },
    });
    return Response.json({ student, enrollments, gpa, releasedResults });
  } catch (error) {
    return authErrorResponse(error);
  }
}
