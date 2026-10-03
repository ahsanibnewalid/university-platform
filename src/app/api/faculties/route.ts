import { authErrorResponse, assertSameOrigin, requireSession } from "@/lib/auth";
import { administrativeRoles, isPrismaUniqueError, readJsonObject, recordAudit, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession();
    const faculties = await prisma.faculty.findMany({
      where: { institutionId: session.membership.institutionId },
      include: {
        _count: { select: { departments: true } },
        departments: { select: { id: true, name: true, code: true } },
      },
      orderBy: { name: "asc" },
      take: 100,
    });
    return Response.json({ faculties });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(administrativeRoles);
    const input = await readJsonObject(request);
    const name = requiredText(input.name, "Faculty name", 2, 120);
    const code = requiredText(input.code, "Faculty code", 2, 16).toUpperCase();
    const faculty = await prisma.faculty.create({
      data: { institutionId: session.membership.institutionId, name, code },
    });
    await recordAudit(session, "administration.faculty.created", "Faculty", faculty.id);
    return Response.json({ faculty }, { status: 201 });
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return Response.json({ error: "A faculty with that code already exists." }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}
