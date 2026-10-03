import { CampusRole, EnrollmentStatus } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import {
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

export async function GET() {
  try {
    const session = await requireSession([
      ...studentRoles,
      CampusRole.PARENT,
      ...teachingRoles,
    ]);
    const { institutionId, role } = session.membership;
    const studentRole = studentRoles.includes(role);
    const parentRole = role === CampusRole.PARENT;
    const assignments = await prisma.assignment.findMany({
      where: {
        section: {
          term: { institutionId },
          ...(studentRole
            ? {
                enrollments: {
                  some: { studentId: session.userId, status: EnrollmentStatus.ENROLLED },
                },
              }
            : parentRole
              ? {
                  enrollments: {
                    some: {
                      status: EnrollmentStatus.ENROLLED,
                      student: {
                        studentGuardians: {
                          some: {
                            guardianId: session.userId,
                            verifiedAt: { not: null },
                          },
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
      },
      include: {
        section: {
          include: {
            course: { select: { id: true, code: true, title: true } },
            term: { select: { name: true } },
          },
        },
        ...(studentRole
          ? { submissions: { where: { studentId: session.userId } } }
          : parentRole
            ? {}
            : { _count: { select: { submissions: true } } }),
      },
      orderBy: { dueAt: "asc" },
      take: 100,
    });
    return Response.json({ assignments });
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
    const title = requiredText(input.title, "Assignment title", 2, 160);
    const instructions = requiredText(input.instructions, "Instructions", 2, 8000);
    const dueAt = validDate(input.dueAt, "Due date");
    const maxPoints =
      typeof input.maxPoints === "number" &&
      Number.isFinite(input.maxPoints) &&
      input.maxPoints > 0 &&
      input.maxPoints <= 100000
        ? input.maxPoints
        : 0;
    if (!maxPoints) {
      throw new AuthenticationError("Maximum points must be greater than zero.", 400);
    }
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
    if (!section) {
      throw new AuthenticationError("Course section not found.", 404);
    }
    const assignment = await prisma.assignment.create({
      data: {
        sectionId,
        creatorId: session.userId,
        title,
        instructions,
        dueAt,
        maxPoints,
      },
    });
    await recordAudit(session, "academic.assignment.created", "Assignment", assignment.id);
    return Response.json({ assignment }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
