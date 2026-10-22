import {
  AcademicSessionStatus,
  CampusRole,
  Prisma,
} from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { readJsonObject, requiredText, validDate } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const sessionManagers: CampusRole[] = [
  CampusRole.SUPER_ADMIN,
  CampusRole.UNIVERSITY_ADMIN,
  CampusRole.PRINCIPAL,
  CampusRole.REGISTRAR,
  CampusRole.OFFICE_STAFF,
];

function isSessionStatus(value: unknown): value is AcademicSessionStatus {
  return typeof value === "string" &&
    Object.values(AcademicSessionStatus).includes(value as AcademicSessionStatus);
}

export async function GET() {
  try {
    const session = await requireSession();
    const sessions = await prisma.academicSession.findMany({
      where: { institutionId: session.membership.institutionId },
      include: {
        program: { select: { id: true, name: true, code: true, programType: true } },
        _count: { select: { enrollments: true, transcriptResults: true } },
      },
      orderBy: [{ startsAt: "desc" }, { name: "asc" }],
      take: 200,
    });
    return Response.json({ sessions });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(sessionManagers);
    const input = await readJsonObject(request);
    const name = requiredText(input.name, "Academic session name", 3, 80);
    const startsAt = validDate(input.startsAt, "Session start date");
    const endsAt = validDate(input.endsAt, "Session end date");
    if (endsAt < startsAt) {
      throw new AuthenticationError("Session end date must be on or after its start date.", 400);
    }

    const programId = input.programId === undefined || input.programId === null || input.programId === ""
      ? null
      : requiredText(input.programId, "Program", 1, 100);
    const status = input.status === undefined
      ? AcademicSessionStatus.PLANNED
      : isSessionStatus(input.status)
        ? input.status
        : null;
    if (!status) throw new AuthenticationError("Select a valid academic session status.", 400);

    if (programId) {
      const program = await prisma.program.findFirst({
        where: {
          id: programId,
          department: { institutionId: session.membership.institutionId },
        },
        select: { id: true },
      });
      if (!program) throw new AuthenticationError("Program not found for this college.", 404);
    }

    const created = await prisma.$transaction(async (tx) => {
      const academicSession = await tx.academicSession.create({
        data: {
          institutionId: session.membership.institutionId,
          programId,
          name,
          startsAt,
          endsAt,
          status,
        },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "academic.session.created",
          entityType: "AcademicSession",
          entityId: academicSession.id,
          metadata: {
            name,
            programId,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            status,
          },
        },
      });
      return academicSession;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return Response.json({ session: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "An academic session with that name already exists for this college." }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}
