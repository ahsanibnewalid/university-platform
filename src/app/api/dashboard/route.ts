import { CampusRole, EnrollmentStatus } from "@prisma/client";
import { authErrorResponse, requireSession } from "@/lib/auth";
import {
  administrativeRoles,
  courseTeachingRoles,
  departmentRoles,
  studentRoles,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession();
    const institutionId = session.membership.institutionId;
    const role = session.membership.role;
    const userId = session.userId;

    if (studentRoles.includes(role)) {
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
              studentProfile: {
                select: {
                  studentNumber: true,
                  academicStatus: true,
                  currentTerm: { select: { name: true } },
                },
              },
              enrollments: {
                where: {
                  status: EnrollmentStatus.ENROLLED,
                  section: { term: { institutionId } },
                },
                include: {
                  section: {
                    include: {
                      course: { select: { code: true, title: true } },
                      term: { select: { name: true } },
                      meetings: {
                        where: { startsAt: { gte: new Date() } },
                        orderBy: { startsAt: "asc" },
                        take: 4,
                      },
                    },
                  },
                },
                take: 20,
              },
            },
          },
        },
      });
      const studentIds = children.map((link) => link.student.id);
      const sectionIds = children.flatMap((link) =>
        link.student.enrollments.map((enrollment) => enrollment.sectionId),
      );
      const [assignments, attendanceRecords, results, fees] = await Promise.all([
        prisma.assignment.findMany({
          where: {
            sectionId: { in: sectionIds },
            dueAt: { gte: new Date() },
          },
          include: {
            section: { include: { course: { select: { code: true, title: true } } } },
          },
          orderBy: { dueAt: "asc" },
          take: 30,
        }),
        prisma.attendanceRecord.findMany({
          where: {
            studentId: { in: studentIds },
            meeting: { sectionId: { in: sectionIds } },
          },
          select: {
            studentId: true,
            status: true,
            meeting: {
              select: {
                startsAt: true,
                section: { select: { course: { select: { code: true, title: true } } } },
              },
            },
          },
          orderBy: { meeting: { startsAt: "desc" } },
        }),
        prisma.examResult.findMany({
          where: {
            studentId: { in: studentIds },
            releasedAt: { not: null },
            exam: { section: { term: { institutionId } } },
          },
          include: {
            exam: {
              include: {
                section: { include: { course: { select: { code: true, title: true } } } },
              },
            },
          },
          orderBy: { releasedAt: "desc" },
          take: 50,
        }),
        prisma.feeRecord.findMany({
          where: { institutionId, studentId: { in: studentIds } },
          orderBy: { dueAt: "asc" },
          take: 50,
        }),
      ]);
      const enrichedChildren = children.map((link) => {
        const studentId = link.student.id;
        const attendance = attendanceRecords.filter((record) => record.studentId === studentId);
        return {
          ...link.student,
          upcomingAssignments: assignments.filter((assignment) =>
            link.student.enrollments.some(
              (enrollment) => enrollment.sectionId === assignment.sectionId,
            ),
          ),
          attendance: attendance.slice(0, 20),
          attendanceRate:
            attendance.length === 0
              ? null
              : Math.round(
                  (attendance.filter((record) => record.status === "PRESENT").length /
                    attendance.length) *
                    100,
                ),
          results: results.filter((result) => result.studentId === studentId),
          fees: fees.filter((fee) => fee.studentId === studentId),
        };
      });
      return Response.json({
        role,
        institution: session.membership.institution,
        children: enrichedChildren,
      });
    }

    if (courseTeachingRoles.includes(role)) {
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

    if (departmentRoles.includes(role)) {
      const departments = await prisma.department.findMany({
        where: {
          institutionId,
          OR: [
            { chairId: userId },
            { teachers: { some: { userId } } },
          ],
        },
        select: { id: true, name: true, code: true },
      });
      const departmentIds = departments.map((department) => department.id);
      const [programs, students, activeCourses, unreadNotifications] = await Promise.all([
        prisma.program.count({ where: { departmentId: { in: departmentIds } } }),
        prisma.studentProfile.count({
          where: { program: { departmentId: { in: departmentIds } } },
        }),
        prisma.courseSection.count({
          where: {
            course: { departmentId: { in: departmentIds } },
            term: { institutionId, status: "ACTIVE" },
          },
        }),
        prisma.notification.count({ where: { userId, readAt: null } }),
      ]);
      return Response.json({
        role,
        institution: session.membership.institution,
        departments,
        metrics: {
          departments: departments.length,
          programs,
          students,
          activeCourses,
          unreadNotifications,
        },
      });
    }

    if (!administrativeRoles.includes(role)) {
      const unreadNotifications = await prisma.notification.count({
        where: { userId, readAt: null },
      });
      const metrics: Record<string, number> = { unreadNotifications };
      if (role === CampusRole.EXAM_CONTROLLER) {
        metrics.exams = await prisma.exam.count({
          where: { section: { term: { institutionId } } },
        });
      } else if (role === CampusRole.FINANCE_ADMIN) {
        const fees = await prisma.feeRecord.aggregate({
          where: { institutionId },
          _sum: { amountDue: true },
          _count: true,
        });
        metrics.feeRecords = fees._count;
        metrics.feesDue = fees._sum.amountDue?.toNumber() ?? 0;
      } else if (role === CampusRole.LIBRARIAN) {
        metrics.libraryItems = await prisma.libraryItem.count({ where: { institutionId } });
      } else if (role === CampusRole.HOSTEL_MANAGER) {
        metrics.hostelBuildings = await prisma.hostelBuilding.count({ where: { institutionId } });
      } else if (role === CampusRole.TRANSPORT_MANAGER) {
        metrics.transitRoutes = await prisma.transitRoute.count({ where: { institutionId } });
      }
      return Response.json({ role, institution: session.membership.institution, metrics });
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
