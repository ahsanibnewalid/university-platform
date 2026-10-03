import {
  CampusRole,
  EnrollmentStatus,
  MembershipStatus,
} from "@prisma/client";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession([
      CampusRole.DEPARTMENT_CHAIR,
      CampusRole.PRINCIPAL,
      CampusRole.UNIVERSITY_ADMIN,
      CampusRole.SUPER_ADMIN,
    ]);
    const institutionId = session.membership.institutionId;
    const [
      membersByRole,
      terms,
      enrollmentCount,
      attendanceByStatus,
      assignmentCount,
      applicationCount,
      eventCount,
    ] = await Promise.all([
      prisma.membership.groupBy({
        by: ["role"],
        where: { institutionId, status: MembershipStatus.ACTIVE },
        _count: { _all: true },
      }),
      prisma.academicTerm.findMany({
        where: { institutionId },
        select: {
          id: true,
          name: true,
          status: true,
          startsAt: true,
          endsAt: true,
          _count: { select: { sections: true } },
        },
        orderBy: { startsAt: "desc" },
        take: 20,
      }),
      prisma.enrollment.count({
        where: {
          status: EnrollmentStatus.ENROLLED,
          section: { term: { institutionId } },
        },
      }),
      prisma.attendanceRecord.groupBy({
        by: ["status"],
        where: { meeting: { section: { term: { institutionId } } } },
        _count: { _all: true },
      }),
      prisma.assignment.count({
        where: { section: { term: { institutionId } } },
      }),
      prisma.jobApplication.count({
        where: { opportunity: { institutionId } },
      }),
      prisma.event.count({ where: { institutionId } }),
    ]);
    return Response.json({
      membersByRole: membersByRole.map((entry) => ({
        role: entry.role,
        count: entry._count._all,
      })),
      terms,
      enrollmentCount,
      attendanceByStatus: attendanceByStatus.map((entry) => ({
        status: entry.status,
        count: entry._count._all,
      })),
      assignmentCount,
      applicationCount,
      eventCount,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
