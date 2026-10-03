import { CampusRole, EnrollmentStatus } from "@prisma/client";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const studentRoles = [CampusRole.STUDENT, CampusRole.MEDICAL_STUDENT, CampusRole.LAW_STUDENT];

export async function GET() {
  try {
    const session = await requireSession(studentRoles);
    const now = new Date();
    const sections = await prisma.courseSection.findMany({
      where: {
        term: {
          institutionId: session.membership.institutionId,
          status: "ACTIVE",
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
        enrollments: {
          none: { studentId: session.userId, status: EnrollmentStatus.ENROLLED },
        },
      },
      include: {
        course: {
          select: {
            id: true,
            code: true,
            title: true,
            credits: true,
            department: { select: { name: true } },
          },
        },
        term: { select: { name: true, endsAt: true } },
        _count: {
          select: {
            enrollments: { where: { status: EnrollmentStatus.ENROLLED } },
          },
        },
      },
      orderBy: [{ course: { code: "asc" } }, { sectionCode: "asc" }],
      take: 100,
    });
    return Response.json({
      availableSections: sections.filter(
        (section) => !section.capacity || section._count.enrollments < section.capacity,
      ),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
