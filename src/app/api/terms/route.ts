import { AcademicTermStatus } from "@prisma/client";
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

export async function GET() {
  try {
    const session = await requireSession();
    const terms = await prisma.academicTerm.findMany({
      where: { institutionId: session.membership.institutionId },
      orderBy: { startsAt: "desc" },
      take: 40,
    });
    return Response.json({ terms });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(administrativeRoles);
    const input = await readJsonObject(request);
    const name = requiredText(input.name, "Academic term name", 2, 100);
    const startsAt = validDate(input.startsAt, "Start date");
    const endsAt = validDate(input.endsAt, "End date");
    if (endsAt <= startsAt) {
      throw new AuthenticationError("End date must be after the start date.", 400);
    }
    const status =
      typeof input.status === "string" &&
      Object.values(AcademicTermStatus).includes(input.status as AcademicTermStatus)
        ? (input.status as AcademicTermStatus)
        : AcademicTermStatus.PLANNED;
    if (status === AcademicTermStatus.ACTIVE) {
      await prisma.$transaction([
        prisma.academicTerm.updateMany({
          where: {
            institutionId: session.membership.institutionId,
            status: AcademicTermStatus.ACTIVE,
          },
          data: { status: AcademicTermStatus.COMPLETED },
        }),
        prisma.academicTerm.create({
          data: {
            institutionId: session.membership.institutionId,
            name,
            startsAt,
            endsAt,
            status,
          },
        }),
      ]);
      const term = await prisma.academicTerm.findUniqueOrThrow({
        where: {
          institutionId_name: {
            institutionId: session.membership.institutionId,
            name,
          },
        },
      });
      await recordAudit(session, "academic.term.created", "AcademicTerm", term.id);
      return Response.json({ term }, { status: 201 });
    }
    const term = await prisma.academicTerm.create({
      data: {
        institutionId: session.membership.institutionId,
        name,
        startsAt,
        endsAt,
        status,
      },
    });
    await recordAudit(session, "academic.term.created", "AcademicTerm", term.id);
    return Response.json({ term }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
