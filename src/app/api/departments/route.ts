import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import {
  departmentRoles,
  administrativeRoles,
  readJsonObject,
  recordAudit,
  requiredText,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { CampusRole, MembershipStatus } from "@prisma/client";

export async function GET() {
  try {
    const session = await requireSession();
    const departments = await prisma.department.findMany({
      where: { institutionId: session.membership.institutionId },
      include: {
        faculty: { select: { id: true, code: true, name: true } },
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
    const session = await requireSession([...administrativeRoles, ...departmentRoles]);
    const input = await readJsonObject(request);
    const name = requiredText(input.name, "Department name", 2, 120);
    const code = requiredText(input.code, "Department code", 2, 16).toUpperCase();
    const facultyId =
      typeof input.facultyId === "string" && input.facultyId
        ? input.facultyId
        : undefined;
    if (
      facultyId &&
      !(await prisma.faculty.findFirst({
        where: { id: facultyId, institutionId: session.membership.institutionId },
        select: { id: true },
      }))
    ) {
      throw new AuthenticationError("Faculty not found at this university.", 404);
    }
    let chairId: string | undefined =
      departmentRoles.includes(session.membership.role)
        ? session.userId
        : undefined;
    if (!chairId && typeof input.chairId === "string" && input.chairId) {
      const chairMembership = await prisma.membership.findFirst({
        where: {
          userId: input.chairId,
          institutionId: session.membership.institutionId,
          role: { in: departmentRoles },
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
        facultyId,
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

// Only college leadership can appoint or replace a department chair. The
// appointee must already hold an active department-lead role at this college.
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession([CampusRole.SUPER_ADMIN, CampusRole.PRINCIPAL]);
    const input = await readJsonObject(request);
    const departmentId = requiredText(input.departmentId, "Department", 5, 100);
    const chairId = input.chairId === "" || input.chairId === null ? null
      : requiredText(input.chairId, "Department chair", 5, 100);
    const institutionId = session.membership.institutionId;
    const department = await prisma.department.findFirst({ where: { id: departmentId, institutionId }, select: { id: true } });
    if (!department) throw new AuthenticationError("College department not found.", 404);
    if (chairId) {
      const appointment = await prisma.membership.findFirst({ where: { userId: chairId, institutionId,
        role: { in: [CampusRole.DEPARTMENT_CHAIR, CampusRole.DEPARTMENT_HEAD] },
        status: MembershipStatus.ACTIVE }, select: { id: true } });
      if (!appointment) throw new AuthenticationError("Assign an active department-lead role to this employee first.", 400);
    }
    await prisma.$transaction(async (tx) => {
      await tx.department.update({ where: { id: department.id }, data: { chairId } });
      await tx.auditEvent.create({ data: { institutionId, actorId: session.userId,
        action: "administration.department.chair_appointed", entityType: "Department",
        entityId: department.id, metadata: { chairUserId: chairId } } });
    });
    return Response.json({ message: chairId ? "Department chair appointment updated." : "Department chair appointment cleared." });
  } catch (error) { return authErrorResponse(error); }
}
