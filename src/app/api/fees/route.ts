import { CampusRole, MembershipStatus } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import {
  administrativeRoles,
  readJsonObject,
  recordAudit,
  requiredText,
  validDate,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

const studentRoles: CampusRole[] = [
  CampusRole.STUDENT,
  CampusRole.MEDICAL_STUDENT,
  CampusRole.LAW_STUDENT,
];

const feeCreationRoles: CampusRole[] = [
  ...administrativeRoles,
  CampusRole.FINANCE_ADMIN,
  CampusRole.ACCOUNTANT,
  CampusRole.OFFICE_STAFF,
];

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const requestedStudentId = new URL(request.url).searchParams.get("studentId");
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
      if (!profile) {
        throw new AuthenticationError("An active student profile is required to view fee records.", 403);
      }
      if (requestedStudentId && requestedStudentId !== profile.userId) {
        throw new AuthenticationError("You can only view your own fee records.", 403);
      }
      const fees = await prisma.feeRecord.findMany({
        where: {
          institutionId: session.membership.institutionId,
          studentId: profile.userId,
        },
        orderBy: { dueAt: "desc" },
        take: 100,
      });
      return Response.json({ fees });
    }

    const canViewAnyStudent = feeCreationRoles.includes(role);
    if (!canViewAnyStudent && role !== CampusRole.PARENT) {
      throw new AuthenticationError("Your role cannot view fee records.", 403);
    }

    const studentId = requestedStudentId;
    if (!studentId) {
      throw new AuthenticationError("studentId is required to view a student's fee records.", 400);
    }

    const studentProfile = await prisma.studentProfile.findFirst({
      where: {
        userId: studentId,
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
    if (!studentProfile) {
      throw new AuthenticationError("Active student profile not found.", 404);
    }

    if (role === CampusRole.PARENT) {
      const guardianLink = await prisma.guardianLink.findFirst({
        where: {
          guardianId: session.userId,
          studentId: studentProfile.userId,
          verifiedAt: { not: null },
          student: {
            memberships: {
              some: {
                institutionId: session.membership.institutionId,
                status: MembershipStatus.ACTIVE,
              },
            },
          },
        },
        select: { studentId: true },
      });
      if (!guardianLink) {
        throw new AuthenticationError("You are not authorized to view this student's fee records.", 403);
      }
    } else if (!canViewAnyStudent) {
      throw new AuthenticationError("Your role cannot view another student's fee records.", 403);
    }

    const fees = await prisma.feeRecord.findMany({
      where: {
        institutionId: session.membership.institutionId,
        studentId: studentProfile.userId,
      },
      orderBy: { dueAt: "desc" },
      take: 100,
    });
    return Response.json({ fees });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(feeCreationRoles);
    const input = await readJsonObject(request);
    const studentId = requiredText(input.studentId, "Student", 1, 100);
    const description = requiredText(input.description, "Fee record", 2, 180);
    const amountDue =
      typeof input.amountDue === "number" &&
      Number.isFinite(input.amountDue) &&
      input.amountDue >= 0 &&
      input.amountDue <= 100000000
        ? input.amountDue
        : -1;

    if (amountDue < 0) {
      throw new AuthenticationError("Amount due must be zero or greater.", 400);
    }
    if (input.currency !== undefined && input.currency !== "BDT") {
      throw new AuthenticationError("Siddheswari College fee records must use BDT.", 400);
    }

    const dueAt = validDate(input.dueAt, "Due date");
    const student = await prisma.studentProfile.findFirst({
      where: {
        userId: studentId,
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
    if (!student) {
      throw new AuthenticationError("Active student profile not found.", 404);
    }

    const fee = await prisma.feeRecord.create({
      data: {
        institutionId: session.membership.institutionId,
        studentId: student.userId,
        description,
        amountDue,
        currency: "BDT",
        dueAt,
      },
    });
    await recordAudit(session, "administration.fee_record.created", "FeeRecord", fee.id);
    return Response.json({ fee }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
