import { CampusRole, EnrollmentStatus } from "@prisma/client";
import {
  authErrorResponse,
  assertSameOrigin,
  requireSession,
  AuthenticationError,
} from "@/lib/auth";
import {
  isPrismaUniqueError,
  courseTeachingRoles,
  departmentRoles,
  readJsonObject,
  recordAudit,
  requiredText,
  teachingRoles,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession();
    const { institutionId, role } = session.membership;
    const userId = session.userId;
    const where =
      role === CampusRole.PARENT
        ? {
            term: { institutionId },
            enrollments: {
              some: {
                student: {
                  studentGuardians: {
                    some: {
                      guardianId: userId,
                      verifiedAt: { not: null },
                    },
                  },
                },
                status: EnrollmentStatus.ENROLLED,
              },
            },
          }
        : role === CampusRole.STUDENT ||
            role === CampusRole.MEDICAL_STUDENT ||
            role === CampusRole.LAW_STUDENT
          ? {
              term: { institutionId },
              enrollments: { some: { studentId: userId, status: EnrollmentStatus.ENROLLED } },
            }
          : courseTeachingRoles.includes(role)
            ? { term: { institutionId }, instructors: { some: { userId } } }
            : departmentRoles.includes(role)
              ? { term: { institutionId }, course: { department: { chairId: userId } } }
              : { term: { institutionId } };
    const sections = await prisma.courseSection.findMany({
      where,
      include: {
        course: {
          select: { id: true, code: true, title: true, description: true, credits: true },
        },
        term: { select: { id: true, name: true, status: true } },
        instructors: { select: { user: { select: { id: true, name: true } } } },
        _count: { select: { enrollments: true } },
      },
      orderBy: [{ term: { startsAt: "desc" } }, { sectionCode: "asc" }],
      take: 100,
    });
    return Response.json({ courses: sections });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(teachingRoles);
    const input = await readJsonObject(request);
    const departmentId = requiredText(input.departmentId, "Department", 1, 100);
    const termId = requiredText(input.termId, "Academic term", 1, 100);
    const code = requiredText(input.code, "Course code", 2, 24).toUpperCase();
    const title = requiredText(input.title, "Course title", 2, 160);
    const sectionCode = requiredText(input.sectionCode, "Section", 1, 20);
    const credits =
      typeof input.credits === "number" &&
      Number.isInteger(input.credits) &&
      input.credits >= 1 &&
      input.credits <= 30
        ? input.credits
        : 0;
    if (!credits) throw new AuthenticationError("Credits must be from 1 to 30.", 400);
    const institutionId = session.membership.institutionId;
    const department = await prisma.department.findFirst({
      where: {
        id: departmentId,
        institutionId,
        ...(departmentRoles.includes(session.membership.role)
          ? { chairId: session.userId }
          : {}),
      },
      select: { id: true },
    });
    const term = await prisma.academicTerm.findFirst({
      where: { id: termId, institutionId },
      select: { id: true },
    });
    if (!department || !term) {
      throw new AuthenticationError(
        "Select an academic term and department from your institution.",
        404,
      );
    }
    const programId =
      typeof input.programId === "string" && input.programId
        ? input.programId
        : undefined;
    if (
      programId &&
      !(await prisma.program.findFirst({
        where: { id: programId, departmentId },
        select: { id: true },
      }))
    ) {
      throw new AuthenticationError("The program does not belong to that department.", 400);
    }
    const course = await prisma.course.create({
      data: {
        departmentId,
        programId,
        code,
        title,
        description: typeof input.description === "string" ? input.description.slice(0, 3000) : "",
        credits,
        sections: {
          create: {
            termId,
            sectionCode,
            room: typeof input.room === "string" ? input.room.slice(0, 100) : null,
            instructors:
              courseTeachingRoles.includes(session.membership.role)
                ? { create: { userId: session.userId } }
                : undefined,
          },
        },
      },
      include: { sections: { include: { term: true } } },
    });
    await recordAudit(session, "academic.course.created", "Course", course.id);
    return Response.json({ course }, { status: 201 });
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return Response.json(
        { error: "That course code is already in use by this department." },
        { status: 409 },
      );
    }
    return authErrorResponse(error);
  }
}
