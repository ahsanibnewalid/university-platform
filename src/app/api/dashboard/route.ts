import { CampusRole, EnrollmentStatus } from "@prisma/client";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession();
    const institutionId = session.membership.institutionId;
    const role = session.membership.role;
    const userId = session.userId;

    if (
      role === CampusRole.STUDENT ||
      role === CampusRole.MEDICAL_STUDENT ||
      role === CampusRole.LAW_STUDENT
    ) {
      const [enrollments, averageGpa, unreadNotifications, guardianLinks] =
        await Promise.all([
          prisma.enrollment.findMany({
            where: {
              studentId: userId,
              status: EnrollmentStatus.ENROLLED,
              section: { term: { institutionId, status: "ACTIVE" } },
            },
            include: {
              section: {
                include: {
                  course: { select: { code: true, title: true, credits: true } },
                  term: { select: { name: true } },
                  meetings: { orderBy: { startsAt: "asc" }, take: 4 },
                },
              },
            },
            take: 30,
          }),
          prisma.enrollment.aggregate({
            where: {
              studentId: userId,
              status: EnrollmentStatus.COMPLETED,
              section: { term: { institutionId } },
            },
            _avg: { gpaPoints: true },
          }),
          prisma.notification.count({ where: { userId, readAt: null } }),
          prisma.guardianLink.count({ where: { studentId: userId, verifiedAt: { not: null } } }),
        ]);
      const sectionIds = enrollments.map((item) => item.sectionId);
      const [assignments, attendanceRecords] = await Promise.all([
        prisma.assignment.findMany({
          where: {
            sectionId: { in: sectionIds },
            dueAt: { gte: new Date() },
          },
          include: {
            section: { include: { course: { select: { code: true, title: true } } } },
          },
          orderBy: { dueAt: "asc" },
          take: 8,
        }),
        prisma.attendanceRecord.findMany({
          where: {
            studentId: userId,
            meeting: { sectionId: { in: sectionIds } },
          },
          select: { status: true },
        }),
      ]);
      const attendanceRate =
        attendanceRecords.length === 0
          ? null
          : Math.round(
              (attendanceRecords.filter((record) => record.status === "PRESENT").length /
                attendanceRecords.length) *
                100,
            );
      return Response.json({
        role,
        institution: session.membership.institution,
        courses: enrollments,
        upcomingAssignments: assignments,
        gpa: averageGpa._avg.gpaPoints?.toNumber() ?? null,
        attendanceRate,
        unreadNotifications,
        verifiedGuardians: guardianLinks,
      });
    }

    if (role === CampusRole.PARENT) {
      const children = await prisma.guardianLink.findMany({
        where: {
          guardianId: userId,
          verifiedAt: { not: null },
          student: { memberships: { some: { institutionId, status: "ACTIVE" } } },
        },
        select: {
          student: {
            select: {
              id: true,
              name: true,
              enrollments: {
                where: { status: EnrollmentStatus.ENROLLED },
                include: {
                  section: {
                    include: {
                      course: { select: { code: true, title: true } },
                      term: { select: { name: true } },
                    },
                  },
                },
                take: 20,
              },
            },
          },
        },
      });
      return Response.json({
        role,
        institution: session.membership.institution,
        children: children.map((link) => link.student),
      });
    }

    if (role === CampusRole.FACULTY) {
      const [sections, assignments, unreadNotifications] = await Promise.all([
        prisma.courseSection.findMany({
          where: {
            term: { institutionId, status: "ACTIVE" },
            instructors: { some: { userId } },
          },
          include: {
            course: { select: { code: true, title: true } },
            _count: { select: { enrollments: true } },
          },
          take: 30,
        }),
        prisma.assignment.findMany({
          where: {
            creatorId: userId,
            section: { term: { institutionId } },
          },
          include: {
            section: { include: { course: { select: { code: true, title: true } } } },
            _count: { select: { submissions: true } },
          },
          orderBy: { dueAt: "asc" },
          take: 20,
        }),
        prisma.notification.count({ where: { userId, readAt: null } }),
      ]);
      return Response.json({
        role,
        institution: session.membership.institution,
        sections,
        assignments,
        unreadNotifications,
      });
    }

    const [
      students,
      faculty,
      departments,
      activeCourses,
      openSupportTickets,
      unreadNotifications,
    ] = await Promise.all([
      prisma.membership.count({
        where: {
          institutionId,
          status: "ACTIVE",
          role: { in: [CampusRole.STUDENT, CampusRole.MEDICAL_STUDENT, CampusRole.LAW_STUDENT] },
        },
      }),
      prisma.membership.count({
        where: { institutionId, status: "ACTIVE", role: CampusRole.FACULTY },
      }),
      prisma.department.count({ where: { institutionId } }),
      prisma.courseSection.count({
        where: { term: { institutionId, status: "ACTIVE" } },
      }),
      prisma.supportTicket.count({
        where: { institutionId, status: { in: ["OPEN", "IN_PROGRESS"] } },
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return Response.json({
      role,
      institution: session.membership.institution,
      metrics: { students, faculty, departments, activeCourses, openSupportTickets },
      unreadNotifications,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
