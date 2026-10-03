import { CampusRole, Weekday } from "@prisma/client";
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
  recordAudit,
  requiredText,
  studentRoles,
  teachingRoles,
  validDate,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

function timeMinutes(value: unknown, label: string) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new AuthenticationError(`${label} must use 24-hour HH:mm format.`, 400);
  }
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export async function GET() {
  try {
    const session = await requireSession([
      ...studentRoles,
      CampusRole.PARENT,
      ...teachingRoles,
    ]);
    const { role, institutionId } = session.membership;
    const where = {
      section: {
        term: { institutionId },
        ...(studentRoles.includes(role)
          ? { enrollments: { some: { studentId: session.userId, status: "ENROLLED" as const } } }
          : role === CampusRole.PARENT
            ? {
                enrollments: {
                  some: {
                    student: {
                      studentGuardians: {
                        some: { guardianId: session.userId, verifiedAt: { not: null } },
                      },
                    },
                  },
                },
              }
            : courseTeachingRoles.includes(role)
              ? { instructors: { some: { userId: session.userId } } }
              : departmentRoles.includes(role)
                ? { course: { department: { chairId: session.userId } } }
                : {}),
      },
    };
    const schedules = await prisma.classSchedule.findMany({
      where,
      include: {
        classroom: { select: { code: true, name: true, building: true } },
        section: {
          include: {
            course: { select: { code: true, title: true } },
            term: { select: { name: true } },
          },
        },
      },
      orderBy: [{ weekday: "asc" }, { startsAt: "asc" }],
      take: 500,
    });
    return Response.json({ schedules });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession([...administrativeRoles, ...departmentRoles, ...courseTeachingRoles]);
    const input = await readJsonObject(request);
    const sectionId = requiredText(input.sectionId, "Course section", 1, 100);
    const weekday =
      typeof input.weekday === "string" &&
      Object.values(Weekday).includes(input.weekday as Weekday)
        ? (input.weekday as Weekday)
        : null;
    if (!weekday) throw new AuthenticationError("Select a valid weekday.", 400);
    const startsAt = requiredText(input.startsAt, "Start time", 5, 5);
    const endsAt = requiredText(input.endsAt, "End time", 5, 5);
    const startMinutes = timeMinutes(startsAt, "Start time");
    const endMinutes = timeMinutes(endsAt, "End time");
    if (endMinutes <= startMinutes) {
      throw new AuthenticationError("End time must be later than start time.", 400);
    }
    const classroomId =
      typeof input.classroomId === "string" && input.classroomId.trim()
        ? input.classroomId.trim()
        : null;
    const effectiveFrom =
      input.effectiveFrom === undefined || input.effectiveFrom === ""
        ? null
        : validDate(input.effectiveFrom, "Effective start date");
    const effectiveUntil =
      input.effectiveUntil === undefined || input.effectiveUntil === ""
        ? null
        : validDate(input.effectiveUntil, "Effective end date");
    if (effectiveFrom && effectiveUntil && effectiveUntil < effectiveFrom) {
      throw new AuthenticationError("Effective end date must not be before its start date.", 400);
    }
    const role = session.membership.role;
    const section = await prisma.courseSection.findFirst({
      where: {
        id: sectionId,
        term: { institutionId: session.membership.institutionId },
        ...(courseTeachingRoles.includes(role)
          ? { instructors: { some: { userId: session.userId } } }
          : departmentRoles.includes(role)
            ? { course: { department: { chairId: session.userId } } }
            : {}),
      },
      include: { instructors: { select: { userId: true } } },
    });
    if (!section) throw new AuthenticationError("Course section not found.", 404);
    if (classroomId) {
      const classroom = await prisma.classroom.findFirst({
        where: { id: classroomId, institutionId: session.membership.institutionId },
        select: { id: true },
      });
      if (!classroom) throw new AuthenticationError("Classroom not found.", 404);
    }
    const existingSchedules = await prisma.classSchedule.findMany({
      where: {
        weekday,
        section: { term: { institutionId: session.membership.institutionId } },
      },
      include: {
        section: { include: { instructors: { select: { userId: true } } } },
      },
    });
    const instructorIds = new Set(section.instructors.map((instructor) => instructor.userId));
    const conflicts = existingSchedules.filter((existing) => {
      const overlapsTime =
        startsAt < existing.endsAt && endsAt > existing.startsAt;
      const datesOverlap =
        (!effectiveUntil || !existing.effectiveFrom || existing.effectiveFrom <= effectiveUntil) &&
        (!existing.effectiveUntil || !effectiveFrom || effectiveFrom <= existing.effectiveUntil);
      const sharesInstructor = existing.section.instructors.some((instructor) =>
        instructorIds.has(instructor.userId),
      );
      const sharesRoom = classroomId !== null && classroomId === existing.classroomId;
      return (
        overlapsTime &&
        datesOverlap &&
        (existing.sectionId === sectionId || sharesInstructor || sharesRoom)
      );
    });
    if (conflicts.length) {
      throw new AuthenticationError(
        "This schedule conflicts with an existing section, instructor, or classroom booking.",
        409,
      );
    }
    const schedule = await prisma.classSchedule.create({
      data: {
        sectionId,
        classroomId,
        weekday,
        startsAt,
        endsAt,
        effectiveFrom,
        effectiveUntil,
      },
      include: {
        classroom: { select: { code: true, name: true } },
        section: { include: { course: { select: { code: true, title: true } } } },
      },
    });
    await recordAudit(session, "academic.schedule.created", "ClassSchedule", schedule.id);
    return Response.json({ schedule }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
