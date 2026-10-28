import { AppointmentStatus, CampusRole, EnrollmentStatus, MembershipStatus, Prisma } from "@prisma/client";
import { AuthenticationError, assertSameOrigin, authErrorResponse, requireSession } from "@/lib/auth";
import { administrativeRoles, readJsonObject, recordAudit, requiredText, studentRoles } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const teacherRoles: CampusRole[] = [CampusRole.TEACHER, CampusRole.FACULTY];

async function verifiedChildren(guardianId: string, institutionId: string) {
  return prisma.guardianLink.findMany({
    where: {
      guardianId,
      verifiedAt: { not: null },
      student: {
        memberships: { some: { institutionId, status: MembershipStatus.ACTIVE, role: { in: studentRoles } } },
      },
    },
    select: { studentId: true, student: { select: { name: true } } },
  });
}

export async function GET() {
  try {
    const session = await requireSession();
    const { role, institutionId } = session.membership;
    let where: Prisma.ParentTeacherAppointmentWhereInput = { institutionId };
    let teachers: { studentId: string; teacherId: string; name: string }[] = [];
    let children: { id: string; name: string }[] = [];
    if (role === CampusRole.PARENT) {
      const verified = await verifiedChildren(session.userId, institutionId);
      const childIds = verified.map((link) => link.studentId);
      children = verified.map((link) => ({ id: link.studentId, name: link.student.name }));
      where = { institutionId, parentId: session.userId, studentId: { in: childIds } };
      const assignments = await prisma.courseInstructor.findMany({
        where: {
          section: {
            term: { institutionId },
            enrollments: { some: { studentId: { in: childIds }, status: EnrollmentStatus.ENROLLED } },
          },
          user: {
            memberships: { some: { institutionId, status: MembershipStatus.ACTIVE, role: { in: teacherRoles } } },
          },
        },
        select: {
          userId: true,
          user: { select: { name: true } },
          section: {
            select: { enrollments: { where: { studentId: { in: childIds }, status: EnrollmentStatus.ENROLLED }, select: { studentId: true } } },
          },
        },
      });
      const unique = new Set<string>();
      teachers = assignments.flatMap((assignment) =>
        assignment.section.enrollments.flatMap((enrollment) => {
          const key = `${enrollment.studentId}:${assignment.userId}`;
          if (unique.has(key)) return [];
          unique.add(key);
          return [{ studentId: enrollment.studentId, teacherId: assignment.userId, name: assignment.user.name }];
        }),
      );
    } else if (teacherRoles.includes(role)) {
      where = { institutionId, teacherId: session.userId };
    } else if (!administrativeRoles.includes(role)) {
      throw new AuthenticationError("Appointments are unavailable for this role.", 403);
    }
    const appointments = await prisma.parentTeacherAppointment.findMany({
      where,
      include: {
        parent: { select: { name: true } },
        student: { select: { name: true } },
        teacher: { select: { name: true } },
      },
      orderBy: { requestedAt: "desc" },
      take: 100,
    });
    return Response.json({ appointments, children, teachers });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession([CampusRole.PARENT]);
    const input = await readJsonObject(request);
    const studentId = requiredText(input.studentId, "Student", 1, 100);
    const teacherId = requiredText(input.teacherId, "Teacher", 1, 100);
    const note = requiredText(input.note, "Meeting reason", 10, 1000);
    const institutionId = session.membership.institutionId;
    const verified = await prisma.guardianLink.count({
      where: {
        guardianId: session.userId,
        studentId,
        verifiedAt: { not: null },
        student: {
          memberships: { some: { institutionId, status: MembershipStatus.ACTIVE, role: { in: studentRoles } } },
        },
      },
    });
    if (!verified) throw new AuthenticationError("Student is not a verified active child.", 403);
    const assigned = await prisma.courseInstructor.count({
      where: {
        userId: teacherId,
        user: { memberships: { some: { institutionId, status: MembershipStatus.ACTIVE, role: { in: teacherRoles } } } },
        section: {
          term: { institutionId },
          enrollments: { some: { studentId, status: EnrollmentStatus.ENROLLED } },
        },
      },
    });
    if (!assigned) throw new AuthenticationError("This teacher is not assigned to the student.", 403);
    if (typeof input.requestedAt !== "string") throw new AuthenticationError("Meeting date is required.", 400);
    const requestedAt = new Date(input.requestedAt);
    const minimum = Date.now() + 24 * 60 * 60 * 1000;
    const maximum = Date.now() + 90 * 24 * 60 * 60 * 1000;
    if (!Number.isFinite(requestedAt.getTime()) || requestedAt.getTime() < minimum || requestedAt.getTime() > maximum) {
      throw new AuthenticationError("Choose a meeting time between 24 hours and 90 days ahead.", 400);
    }
    const pending = await prisma.parentTeacherAppointment.count({
      where: { parentId: session.userId, studentId, teacherId, status: AppointmentStatus.PENDING },
    });
    if (pending >= 3) throw new AuthenticationError("Too many pending requests for this teacher and student.", 409);
    const appointment = await prisma.parentTeacherAppointment.create({
      data: { institutionId, parentId: session.userId, studentId, teacherId, requestedAt, note },
    });
    await prisma.notification.create({
      data: {
        userId: teacherId, type: "appointment.requested", title: "Parent meeting requested",
        body: "A verified guardian has requested a meeting.", link: "/appointments",
      },
    });
    await recordAudit(session, "academic.appointment.requested", "ParentTeacherAppointment", appointment.id);
    return Response.json({ appointment }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession([CampusRole.PARENT, ...teacherRoles]);
    const input = await readJsonObject(request);
    const id = requiredText(input.id, "Appointment", 1, 100);
    const status = input.status;
    const isParent = session.membership.role === CampusRole.PARENT;
    if (isParent ? status !== AppointmentStatus.CANCELLED : !([AppointmentStatus.CONFIRMED, AppointmentStatus.DECLINED] as AppointmentStatus[]).includes(status as AppointmentStatus)) {
      throw new AuthenticationError("Invalid appointment action.", 400);
    }
    const appointment = await prisma.parentTeacherAppointment.findFirst({
      where: {
        id, institutionId: session.membership.institutionId, status: AppointmentStatus.PENDING,
        ...(isParent ? { parentId: session.userId } : { teacherId: session.userId }),
      },
      select: { id: true, parentId: true, teacherId: true },
    });
    if (!appointment) throw new AuthenticationError("Pending appointment not found.", 404);
    const response = typeof input.response === "string" ? input.response.trim() : "";
    if (response.length > 1000) throw new AuthenticationError("Response is too long.", 400);
    const result = await prisma.parentTeacherAppointment.updateMany({
      where: { id, institutionId: session.membership.institutionId, status: AppointmentStatus.PENDING },
      data: { status: status as AppointmentStatus, response: response || null, reviewedAt: new Date() },
    });
    if (!result.count) throw new AuthenticationError("Appointment has already changed.", 409);
    await prisma.notification.create({
      data: {
        userId: isParent ? appointment.teacherId : appointment.parentId,
        type: "appointment.updated", title: "Parent–teacher appointment updated",
        body: `Appointment status: ${status}`, link: "/appointments",
      },
    });
    await recordAudit(session, "academic.appointment.updated", "ParentTeacherAppointment", id);
    return Response.json({ updated: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
