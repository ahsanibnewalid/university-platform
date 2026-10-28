import { CampusRole, LeaveRequestStatus, MembershipStatus, Prisma } from "@prisma/client";
import { AuthenticationError, assertSameOrigin, authErrorResponse, requireSession } from "@/lib/auth";
import { administrativeRoles, readJsonObject, recordAudit, requiredText, studentRoles } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const reviewerRoles: CampusRole[] = [...administrativeRoles, CampusRole.TEACHER, CampusRole.FACULTY];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: unknown, label: string): Date {
  if (typeof value !== "string" || !datePattern.test(value)) {
    throw new AuthenticationError(`${label} must be YYYY-MM-DD.`, 400);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new AuthenticationError(`${label} is invalid.`, 400);
  }
  return parsed;
}

function teacherStudentFilter(institutionId: string, teacherId: string) {
  return {
    enrollments: {
      some: {
        section: {
          term: { institutionId },
          instructors: { some: { userId: teacherId } },
        },
      },
    },
  };
}

export async function GET() {
  try {
    const session = await requireSession();
    const role = session.membership.role;
    const institutionId = session.membership.institutionId;
    let where: Prisma.LeaveRequestWhereInput = { institutionId };
    if (role === CampusRole.PARENT) {
      where = {
        institutionId,
        student: {
          guardianLinks: {
            some: { guardianId: session.userId, verifiedAt: { not: null } },
          },
          memberships: {
            some: { institutionId, status: MembershipStatus.ACTIVE, role: { in: studentRoles } },
          },
        },
      };
    } else if (studentRoles.includes(role)) {
      where = { institutionId, studentId: session.userId };
    } else if (role === CampusRole.TEACHER || role === CampusRole.FACULTY) {
      where = { institutionId, student: teacherStudentFilter(institutionId, session.userId) };
    } else if (!administrativeRoles.includes(role)) {
      throw new AuthenticationError("Leave requests are unavailable for this role.", 403);
    }
    const requests = await prisma.leaveRequest.findMany({
      where,
      include: {
        student: { select: { id: true, name: true } },
        requester: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return Response.json({ requests });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession([CampusRole.PARENT, ...studentRoles]);
    const input = await readJsonObject(request);
    const institutionId = session.membership.institutionId;
    const studentId = session.membership.role === CampusRole.PARENT
      ? requiredText(input.studentId, "Student", 1, 100)
      : session.userId;
    const student = await prisma.user.findFirst({
      where: {
        id: studentId,
        memberships: {
          some: { institutionId, status: MembershipStatus.ACTIVE, role: { in: studentRoles } },
        },
        ...(session.membership.role === CampusRole.PARENT
          ? { studentGuardians: { some: { guardianId: session.userId, verifiedAt: { not: null } } } }
          : {}),
      },
      select: { id: true },
    });
    if (!student) throw new AuthenticationError("Student is not linked or active in this institution.", 403);

    const startDate = parseDate(input.startDate, "Start date");
    const endDate = parseDate(input.endDate, "End date");
    if (endDate < startDate) throw new AuthenticationError("End date must not precede start date.", 400);
    if (endDate.getTime() - startDate.getTime() > 30 * 86400000) {
      throw new AuthenticationError("Leave requests cannot exceed 31 calendar days.", 400);
    }
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (endDate < new Date(today.getTime() - 7 * 86400000)) {
      throw new AuthenticationError("The requested period is too far in the past.", 400);
    }
    const reason = requiredText(input.reason, "Leave reason", 10, 2000);
    const activeRequests = await prisma.leaveRequest.count({
      where: { studentId, institutionId, status: LeaveRequestStatus.PENDING },
    });
    if (activeRequests >= 5) throw new AuthenticationError("Too many pending leave requests.", 409);

    const leave = await prisma.leaveRequest.create({
      data: { institutionId, studentId, requesterId: session.userId, startDate, endDate, reason },
    });
    await recordAudit(session, "academic.leave.requested", "LeaveRequest", leave.id);
    return Response.json({ leave }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(reviewerRoles);
    const input = await readJsonObject(request);
    const id = requiredText(input.id, "Leave request", 1, 100);
    if (input.status !== LeaveRequestStatus.APPROVED && input.status !== LeaveRequestStatus.REJECTED) {
      throw new AuthenticationError("Choose APPROVED or REJECTED.", 400);
    }
    const current = await prisma.leaveRequest.findFirst({
      where: { id, institutionId: session.membership.institutionId, status: LeaveRequestStatus.PENDING },
      select: { id: true, studentId: true, requesterId: true },
    });
    if (!current) throw new AuthenticationError("Pending request not found.", 404);

    if (([CampusRole.TEACHER, CampusRole.FACULTY] as CampusRole[]).includes(session.membership.role)) {
      const assigned = await prisma.enrollment.count({
        where: {
          studentId: current.studentId,
          section: {
            term: { institutionId: session.membership.institutionId },
            instructors: { some: { userId: session.userId } },
          },
        },
      });
      if (!assigned) throw new AuthenticationError("You do not teach this student.", 403);
    }

    const note = typeof input.reviewNote === "string" ? input.reviewNote.trim() : "";
    if (note.length > 1000) throw new AuthenticationError("Review note is too long.", 400);
    const updated = await prisma.leaveRequest.updateMany({
      where: { id, institutionId: session.membership.institutionId, status: LeaveRequestStatus.PENDING },
      data: {
        status: input.status,
        reviewNote: note || null,
        reviewerId: session.userId,
        reviewedAt: new Date(),
      },
    });
    if (!updated.count) throw new AuthenticationError("The request has already been reviewed.", 409);
    await prisma.notification.createMany({
      data: [...new Set([current.requesterId, current.studentId])].map((userId) => ({
        userId,
        type: "leave.reviewed",
        title: input.status === LeaveRequestStatus.APPROVED ? "Leave request approved" : "Leave request declined",
        body: note || "Your leave request has been reviewed.",
        link: "/dashboard?module=Parents",
      })),
    });
    await recordAudit(session, "academic.leave.reviewed", "LeaveRequest", id);
    return Response.json({ updated: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
