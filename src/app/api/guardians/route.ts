import { CampusRole, MembershipStatus } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { readJsonObject, requiredText, recordAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const studentRoles = [CampusRole.STUDENT, CampusRole.MEDICAL_STUDENT, CampusRole.LAW_STUDENT];

export async function GET() {
  try {
    const session = await requireSession([
      CampusRole.PARENT,
      ...studentRoles,
      CampusRole.UNIVERSITY_ADMIN,
      CampusRole.SUPER_ADMIN,
    ]);
    const isParent = session.membership.role === CampusRole.PARENT;
    const links = await prisma.guardianLink.findMany({
      where: {
        ...(isParent
          ? { guardianId: session.userId }
          : {
              studentId: session.userId,
              student: {
                memberships: {
                  some: { institutionId: session.membership.institutionId, status: MembershipStatus.ACTIVE },
                },
              },
            }),
      },
      include: {
        guardian: { select: { id: true, name: true, email: true } },
        student: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ links });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession([CampusRole.PARENT]);
    const input = await readJsonObject(request);
    const email = requiredText(input.studentEmail, "Student email", 5, 254).toLowerCase();
    const student = await prisma.user.findFirst({
      where: {
        email,
        memberships: {
          some: {
            institutionId: session.membership.institutionId,
            status: MembershipStatus.ACTIVE,
            role: { in: studentRoles },
          },
        },
      },
      select: { id: true, name: true },
    });
    if (!student) {
      throw new AuthenticationError(
        "No active student account with that email was found at this institution.",
        404,
      );
    }
    if (student.id === session.userId) {
      throw new AuthenticationError("You cannot link your account as its own student.", 400);
    }
    const link = await prisma.guardianLink.upsert({
      where: { guardianId_studentId: { guardianId: session.userId, studentId: student.id } },
      create: { guardianId: session.userId, studentId: student.id },
      update: { verifiedAt: null, createdAt: new Date() },
      include: { student: { select: { id: true, name: true } } },
    });
    await prisma.notification.create({
      data: {
        userId: student.id,
        type: "guardian.request",
        title: "Guardian access request",
        body: `${session.user.name} requested permission to view your academic progress.`,
        link: "/dashboard?module=guardians",
      },
    });
    await recordAudit(session, "identity.guardian_link.requested", "GuardianLink", `${session.userId}:${student.id}`);
    return Response.json({ link }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(studentRoles);
    const input = await readJsonObject(request);
    const guardianId = requiredText(input.guardianId, "Guardian", 1, 100);
    const link = await prisma.guardianLink.findFirst({
      where: {
        guardianId,
        studentId: session.userId,
        student: {
          memberships: {
            some: {
              institutionId: session.membership.institutionId,
              status: MembershipStatus.ACTIVE,
            },
          },
        },
      },
      select: { guardianId: true, studentId: true },
    });
    if (!link) throw new AuthenticationError("Guardian access request not found.", 404);
    if (input.approve === true) {
      await prisma.guardianLink.update({
        where: { guardianId_studentId: link },
        data: { verifiedAt: new Date() },
      });
      await prisma.notification.create({
        data: {
          userId: guardianId,
          type: "guardian.approved",
          title: "Guardian access approved",
          body: `${session.user.name} approved your request to view their academic progress.`,
          link: "/dashboard",
        },
      });
      await recordAudit(session, "identity.guardian_link.approved", "GuardianLink", `${guardianId}:${session.userId}`);
    } else if (input.approve === false) {
      await prisma.guardianLink.delete({ where: { guardianId_studentId: link } });
      await recordAudit(session, "identity.guardian_link.denied", "GuardianLink", `${guardianId}:${session.userId}`);
    } else {
      throw new AuthenticationError("Choose whether to approve or deny the request.", 400);
    }
    return Response.json({ updated: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
