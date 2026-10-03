import { CampusRole } from "@prisma/client";
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
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession();
    const departments = await prisma.department.findMany({
      where: { institutionId: session.membership.institutionId },
      include: {
        chair: { select: { id: true, name: true } },
        programs: { select: { id: true, code: true, name: true, level: true } },
        _count: { select: { courses: true } },
      },
      orderBy: { name: "asc" },
      take: 200,
    });
    return Response.json({ departments });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(administrativeRoles);
    const input = await readJsonObject(request);
    const name = requiredText(input.name, "Department name", 2, 120);
    const code = requiredText(input.code, "Department code", 2, 16).toUpperCase();
    let chairId: string | undefined;
    if (typeof input.chairId === "string" && input.chairId) {
      const chairMembership = await prisma.membership.findFirst({
        where: {
          userId: input.chairId,
          institutionId: session.membership.institutionId,
          role: CampusRole.DEPARTMENT_CHAIR,
          status: "ACTIVE",
        },
        select: { userId: true },
      });
      if (!chairMembership) {
        throw new AuthenticationError(
          "Department chair must have an active chair role at this institution.",
          400,
        );
      }
      chairId = chairMembership.userId;
    }
    const department = await prisma.department.create({
      data: {
        institutionId: session.membership.institutionId,
        name,
        code,
        chairId,
      },
    });
    await recordAudit(session, "administration.department.created", "Department", department.id);
    return Response.json({ department }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
