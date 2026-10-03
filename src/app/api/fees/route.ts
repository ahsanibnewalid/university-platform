import { CampusRole } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { administrativeRoles, readJsonObject, recordAudit, requiredText, validDate } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const requestedStudent = new URL(request.url).searchParams.get("studentId");
    const studentId = requestedStudent ?? session.userId;
    const isStudent = ([
      CampusRole.STUDENT,
      CampusRole.MEDICAL_STUDENT,
      CampusRole.LAW_STUDENT,
    ] as CampusRole[]).includes(session.membership.role);
    if (studentId !== session.userId && (isStudent || !administrativeRoles.includes(session.membership.role))) {
      const guardianLink = session.membership.role === CampusRole.PARENT
        ? await prisma.guardianLink.findFirst({
            where: { guardianId: session.userId, studentId, verifiedAt: { not: null }, student: { memberships: { some: { institutionId: session.membership.institutionId, status: "ACTIVE" } } } },
            select: { studentId: true },
          })
        : null;
      if (!guardianLink) throw new AuthenticationError("You cannot view those informational fee records.", 403);
    }
    const fees = await prisma.feeRecord.findMany({
      where: { institutionId: session.membership.institutionId, studentId },
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
    const session = await requireSession(administrativeRoles);
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
    if (amountDue < 0) throw new AuthenticationError("Amount due must be zero or greater.", 400);
    const dueAt = validDate(input.dueAt, "Due date");
    const student = await prisma.membership.findFirst({
      where: {
        userId: studentId,
        institutionId: session.membership.institutionId,
        status: "ACTIVE",
        role: { in: [CampusRole.STUDENT, CampusRole.MEDICAL_STUDENT, CampusRole.LAW_STUDENT] },
      },
      select: { userId: true },
    });
    if (!student) throw new AuthenticationError("Active student not found.", 404);
    const fee = await prisma.feeRecord.create({
      data: {
        institutionId: session.membership.institutionId,
        studentId,
        description,
        amountDue,
        currency: typeof input.currency === "string" && /^[A-Z]{3}$/.test(input.currency) ? input.currency : "USD",
        dueAt,
      },
    });
    await recordAudit(session, "administration.fee_record.created", "FeeRecord", fee.id);
    return Response.json({ fee }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
