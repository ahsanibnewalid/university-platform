import { AttendanceStatus, CampusRole, EnrollmentStatus } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { readJsonObject, recordAudit, requiredText, teachingRoles, validDate } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession();
    const student = (
      [CampusRole.STUDENT, CampusRole.MEDICAL_STUDENT, CampusRole.LAW_STUDENT] as CampusRole[]
    ).includes(session.membership.role);
    const meetings = await prisma.classMeeting.findMany({
      where: {
        section: {
          term: { institutionId: session.membership.institutionId },
          ...(student
            ? { enrollments: { some: { studentId: session.userId, status: EnrollmentStatus.ENROLLED } } }
            : session.membership.role === CampusRole.FACULTY
              ? { instructors: { some: { userId: session.userId } } }
              : {}),
        },
      },
      include: {
        section: { include: { course: { select: { code: true, title: true } } } },
        ...(student
          ? { attendance: { where: { studentId: session.userId }, select: { status: true } } }
          : {}),
      },
      orderBy: { startsAt: "asc" },
      take: 100,
    });
    return Response.json({ meetings });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(teachingRoles);
    const input = await readJsonObject(request);
    const sectionId = requiredText(input.sectionId, "Course section", 1, 100);
    const title = requiredText(input.title, "Class title", 2, 120);
    const startsAt = validDate(input.startsAt, "Start time");
    const endsAt = validDate(input.endsAt, "End time");
    if (endsAt <= startsAt) {
      throw new AuthenticationError("End time must be after the start time.", 400);
    }
    const section = await prisma.courseSection.findFirst({
      where: {
        id: sectionId,
        term: { institutionId: session.membership.institutionId },
        ...(session.membership.role === CampusRole.FACULTY
          ? { instructors: { some: { userId: session.userId } } }
          : {}),
      },
      select: { id: true },
    });
    if (!section) throw new AuthenticationError("Course section not found.", 404);
    const meeting = await prisma.classMeeting.create({
      data: {
        sectionId,
        title,
        startsAt,
        endsAt,
        room: typeof input.room === "string" ? input.room.slice(0, 100) : null,
      },
    });
    await recordAudit(session, "academic.meeting.created", "ClassMeeting", meeting.id);
    return Response.json({ meeting }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(teachingRoles);
    const input = await readJsonObject(request);
    const meetingId = requiredText(input.meetingId, "Class meeting", 1, 100);
    const status =
      typeof input.status === "string"
        ? Object.values(AttendanceStatus).find((item) => item === input.status)
        : undefined;
    if (!status) throw new AuthenticationError("Select a valid attendance status.", 400);
    const studentId = requiredText(input.studentId, "Student", 1, 100);
    const meeting = await prisma.classMeeting.findFirst({
      where: {
        id: meetingId,
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
      select: { id: true },
    });
    if (!meeting) throw new AuthenticationError("Meeting or enrolled student not found.", 404);
    const attendance = await prisma.attendanceRecord.upsert({
      where: { meetingId_studentId: { meetingId, studentId } },
      create: { meetingId, studentId, status },
      update: { status, markedAt: new Date() },
    });
    await recordAudit(session, "academic.attendance.marked", "AttendanceRecord", `${meetingId}:${studentId}`);
    return Response.json({ attendance });
  } catch (error) {
    return authErrorResponse(error);
  }
}
