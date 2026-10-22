import {
  AttendanceStatus,
  CampusRole,
  EnrollmentStatus,
  MembershipStatus,
  Prisma,
} from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import {
  administrativeRoles,
  courseTeachingRoles,
  departmentRoles,
  readJsonObject,
  requiredText,
  teachingRoles,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

const studentRoles: CampusRole[] = [
  CampusRole.STUDENT,
  CampusRole.MEDICAL_STUDENT,
  CampusRole.LAW_STUDENT,
];

const attendanceWriterRoles: CampusRole[] = [
  ...teachingRoles,
  ...departmentRoles,
];

type AttendanceInput = {
  studentId: string;
  status: AttendanceStatus;
};

function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" &&
    Object.values(AttendanceStatus).includes(value as AttendanceStatus);
}

async function scopedSectionWhere(
  role: CampusRole,
  userId: string,
) {
  if (studentRoles.includes(role)) {
    return {
      enrollments: {
        some: {
          studentId: userId,
          status: EnrollmentStatus.ENROLLED,
        },
      },
    };
  }
  if (role === CampusRole.PARENT) {
    return {
      enrollments: {
        some: {
          status: EnrollmentStatus.ENROLLED,
          student: {
            studentGuardians: {
              some: { guardianId: userId, verifiedAt: { not: null } },
            },
          },
        },
      },
    };
  }
  if (courseTeachingRoles.includes(role)) {
    return { instructors: { some: { userId } } };
  }
  if (role === CampusRole.DEPARTMENT_CHAIR || role === CampusRole.DEPARTMENT_HEAD) {
    return { course: { department: { chairId: userId } } };
  }
  if (role === CampusRole.EXAM_CONTROLLER || administrativeRoles.includes(role)) return {};
  throw new AuthenticationError("Your role cannot access attendance.", 403);
}

export async function GET(request: Request) {
  try {
    const session = await requireSession([
      ...studentRoles,
      CampusRole.PARENT,
      ...teachingRoles,
      CampusRole.EXAM_CONTROLLER,
    ]);
    const sectionId = new URL(request.url).searchParams.get("sectionId");
    if (!sectionId) throw new AuthenticationError("sectionId is required.", 400);

    const role = session.membership.role;
    if (studentRoles.includes(role)) {
      const profile = await prisma.studentProfile.findFirst({
        where: {
          userId: session.userId,
          user: {
            memberships: {
              some: {
                institutionId: session.membership.institutionId,
                status: MembershipStatus.ACTIVE,
                role: { in: studentRoles },
              },
            },
          },
        },
        select: { userId: true },
      });
      if (!profile) throw new AuthenticationError("An active student profile is required to view attendance.", 403);
    }

    const sectionScope = await scopedSectionWhere(
      role,
      session.userId,
    );
    const section = await prisma.courseSection.findFirst({
      where: {
        id: sectionId,
        term: { institutionId: session.membership.institutionId },
        ...sectionScope,
      },
      select: {
        id: true,
        sectionCode: true,
        course: { select: { id: true, code: true, title: true } },
        meetings: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            attendance: {
              select: { studentId: true, status: true },
            },
          },
          orderBy: { startsAt: "asc" },
        },
        enrollments: {
          where: { status: EnrollmentStatus.ENROLLED },
          select: {
            studentId: true,
            student: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!section) throw new AuthenticationError("Course section not found or access denied.", 404);

    const visibleStudents = studentRoles.includes(role)
      ? section.enrollments.filter((enrollment) => enrollment.studentId === session.userId)
      : section.enrollments;

    let parentStudentIds: Set<string> | null = null;
    if (role === CampusRole.PARENT) {
      const links = await prisma.guardianLink.findMany({
        where: {
          guardianId: session.userId,
          verifiedAt: { not: null },
          studentId: { in: section.enrollments.map((enrollment) => enrollment.studentId) },
        },
        select: { studentId: true },
      });
      const linkedStudentIds = links.map((link) => link.studentId);
      const linkedProfiles = linkedStudentIds.length
        ? await prisma.studentProfile.findMany({
            where: {
              userId: { in: linkedStudentIds },
              user: {
                memberships: {
                  some: {
                    institutionId: session.membership.institutionId,
                    status: MembershipStatus.ACTIVE,
                    role: { in: studentRoles },
                  },
                },
              },
            },
            select: { userId: true },
          })
        : [];
      parentStudentIds = new Set(linkedProfiles.map((profile) => profile.userId));
    }

    const targetEnrollments = role === CampusRole.PARENT
      ? visibleStudents.filter((enrollment) => parentStudentIds?.has(enrollment.studentId))
      : visibleStudents;
    const summaries = targetEnrollments.map((enrollment) => {
      const records = section.meetings.flatMap((meeting) =>
        meeting.attendance.filter((record) => record.studentId === enrollment.studentId),
      );
      const excused = records.filter((record) => record.status === AttendanceStatus.EXCUSED).length;
      const attended = records.filter((record) =>
        record.status === AttendanceStatus.PRESENT || record.status === AttendanceStatus.LATE,
      ).length;
      const denominator = Math.max(section.meetings.length - excused, 0);
      return {
        studentId: enrollment.studentId,
        studentName: enrollment.student.name,
        meetingsHeld: section.meetings.length,
        meetingsRecorded: records.length,
        presentOrLate: attended,
        absent: records.filter((record) => record.status === AttendanceStatus.ABSENT).length,
        excused,
        attendancePercentage: denominator === 0 ? null : Number(((attended / denominator) * 100).toFixed(2)),
      };
    });

    return Response.json({
      section: {
        id: section.id,
        sectionCode: section.sectionCode,
        course: section.course,
      },
      meetings: section.meetings.map((meeting) => ({
        id: meeting.id,
        title: meeting.title,
        startsAt: meeting.startsAt,
      })),
      summaries,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(attendanceWriterRoles);
    const input = await readJsonObject(request);
    const sectionId = requiredText(input.sectionId, "Course section", 1, 100);
    const meetingId = requiredText(input.meetingId, "Class meeting", 1, 100);
    if (!Array.isArray(input.records) || input.records.length < 1 || input.records.length > 250) {
      throw new AuthenticationError("records must contain between 1 and 250 attendance entries.", 400);
    }

    const records: AttendanceInput[] = [];
    const seenStudentIds = new Set<string>();
    for (const item of input.records) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new AuthenticationError("Each attendance entry must be an object.", 400);
      }
      const record = item as Record<string, unknown>;
      const studentId = requiredText(record.studentId, "Student", 1, 100);
      if (seenStudentIds.has(studentId)) {
        throw new AuthenticationError("A student may appear only once per attendance submission.", 400);
      }
      if (!isAttendanceStatus(record.status)) {
        throw new AuthenticationError("Select a valid attendance status.", 400);
      }
      seenStudentIds.add(studentId);
      records.push({ studentId, status: record.status });
    }

    const sectionScope = await scopedSectionWhere(
      session.membership.role,
      session.userId,
    );
    const meeting = await prisma.classMeeting.findFirst({
      where: {
        id: meetingId,
        sectionId,
        section: {
          term: { institutionId: session.membership.institutionId },
          ...sectionScope,
        },
      },
      select: {
        id: true,
        sectionId: true,
        section: {
          select: {
            enrollments: {
              where: {
                status: EnrollmentStatus.ENROLLED,
                student: {
                  memberships: {
                    some: {
                      institutionId: session.membership.institutionId,
                      status: MembershipStatus.ACTIVE,
                      role: { in: studentRoles },
                    },
                  },
                },
              },
              select: { studentId: true },
            },
          },
        },
      },
    });
    if (!meeting) throw new AuthenticationError("Class meeting not found or access denied.", 404);

    const enrolledStudentIds = new Set(meeting.section.enrollments.map((enrollment) => enrollment.studentId));
    const activeProfiles = await prisma.studentProfile.findMany({
      where: {
        userId: { in: [...enrolledStudentIds] },
        user: {
          memberships: {
            some: {
              institutionId: session.membership.institutionId,
              status: MembershipStatus.ACTIVE,
              role: { in: studentRoles },
            },
          },
        },
      },
      select: { userId: true },
    });
    const activeProfileIds = new Set(activeProfiles.map((profile) => profile.userId));
    if (records.some((record) => !enrolledStudentIds.has(record.studentId) || !activeProfileIds.has(record.studentId))) {
      throw new AuthenticationError("Attendance can only be recorded for active students enrolled in this section.", 400);
    }

    await prisma.$transaction(async (tx) => {
      for (const record of records) {
        await tx.attendanceRecord.upsert({
          where: {
            meetingId_studentId: {
              meetingId: meeting.id,
              studentId: record.studentId,
            },
          },
          create: {
            meetingId: meeting.id,
            studentId: record.studentId,
            status: record.status,
            markedAt: new Date(),
          },
          update: {
            status: record.status,
            markedAt: new Date(),
          },
        });
      }
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "academic.attendance.recorded",
          entityType: "ClassMeeting",
          entityId: meeting.id,
          metadata: {
            sectionId: meeting.sectionId,
            entryCount: records.length,
            statuses: records.reduce<Record<string, number>>((counts, record) => {
              counts[record.status] = (counts[record.status] ?? 0) + 1;
              return counts;
            }, {}),
          },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return Response.json({ recorded: records.length, meetingId: meeting.id });
  } catch (error) {
    return authErrorResponse(error);
  }
}
