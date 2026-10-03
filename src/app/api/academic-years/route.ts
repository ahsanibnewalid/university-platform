import { AcademicYearStatus } from "@prisma/client";
import { AuthenticationError, authErrorResponse, assertSameOrigin, requireSession } from "@/lib/auth";
import {
  administrativeRoles,
  isPrismaUniqueError,
  readJsonObject,
  recordAudit,
  requiredText,
  validDate,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession();
    const academicYears = await prisma.academicYear.findMany({
      where: { institutionId: session.membership.institutionId },
      include: { terms: { orderBy: { startsAt: "asc" } } },
      orderBy: { startsAt: "desc" },
      take: 30,
    });
    return Response.json({ academicYears });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(administrativeRoles);
    const input = await readJsonObject(request);
    const name = requiredText(input.name, "Academic year name", 2, 100);
    const startsAt = validDate(input.startsAt, "Start date");
    const endsAt = validDate(input.endsAt, "End date");
    if (endsAt <= startsAt) {
      throw new AuthenticationError("End date must be after the start date.", 400);
    }
    const status =
      typeof input.status === "string" &&
      Object.values(AcademicYearStatus).includes(input.status as AcademicYearStatus)
        ? (input.status as AcademicYearStatus)
        : AcademicYearStatus.PLANNED;
    const academicYear = await prisma.academicYear.create({
      data: {
        institutionId: session.membership.institutionId,
        name,
        startsAt,
        endsAt,
        status,
      },
    });
    await recordAudit(session, "academic.year.created", "AcademicYear", academicYear.id);
    return Response.json({ academicYear }, { status: 201 });
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return Response.json({ error: "An academic year with that name already exists." }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}
