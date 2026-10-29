import { CampusRole, MembershipStatus, Prisma } from "@prisma/client";
import { assertSameOrigin, AuthenticationError, authErrorResponse, requireSession } from "@/lib/auth";
import { readJsonObject, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const managers: CampusRole[] = [CampusRole.SUPER_ADMIN, CampusRole.PRINCIPAL];
const readers: CampusRole[] = [...managers, CampusRole.REGISTRAR, CampusRole.UNIVERSITY_ADMIN];
const assignable = new Set<CampusRole>([
  CampusRole.TEACHER, CampusRole.FACULTY, CampusRole.STAFF, CampusRole.OFFICE_STAFF,
  CampusRole.DEPARTMENT_HEAD, CampusRole.DEPARTMENT_CHAIR, CampusRole.LIBRARIAN,
  CampusRole.HR, CampusRole.ACCOUNTANT, CampusRole.FINANCE_ADMIN, CampusRole.EXAM_CONTROLLER,
  CampusRole.REGISTRAR, CampusRole.STUDENT_AFFAIRS, CampusRole.UNIVERSITY_ADMIN, CampusRole.PRINCIPAL,
]);
const privileged = new Set<CampusRole>([
  CampusRole.PRINCIPAL, CampusRole.UNIVERSITY_ADMIN, CampusRole.REGISTRAR,
  CampusRole.FINANCE_ADMIN, CampusRole.HR, CampusRole.EXAM_CONTROLLER,
]);

export async function GET() {
  try {
    const session = await requireSession(readers);
    const memberships = await prisma.membership.findMany({
      where: { institutionId: session.membership.institutionId },
      select: { id: true, role: true, status: true, userId: true, createdAt: true,
        user: { select: { name: true, email: true,
          studentProfile: { select: { studentNumber: true } } } } },
      orderBy: { createdAt: "desc" }, take: 250,
    });
    return Response.json({ memberships,
      canManage: managers.includes(session.membership.role),
      allowedRoles: [...assignable].filter((role) =>
        session.membership.role === CampusRole.SUPER_ADMIN || !privileged.has(role)),
    });
  } catch (error) { return authErrorResponse(error); }
}

// Only grant additional roles to already-active, verified employees.
// SUPER_ADMIN cannot be assigned through a web endpoint.
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(managers);
    const input = await readJsonObject(request);
    const userId = requiredText(input.userId, "Employee", 5, 100);
    const role = typeof input.role === "string" && assignable.has(input.role as CampusRole)
      ? input.role as CampusRole : null;
    if (!role) throw new AuthenticationError("Choose a permitted employee role.", 400);
    if (privileged.has(role) && session.membership.role !== CampusRole.SUPER_ADMIN) {
      throw new AuthenticationError("Only the Super Admin may assign this privileged role.", 403);
    }
    const institutionId = session.membership.institutionId;
    const employee = await prisma.user.findFirst({ where: { id: userId, emailVerified: { not: null },
      memberships: { some: { institutionId, status: MembershipStatus.ACTIVE,
        role: { notIn: [CampusRole.STUDENT, CampusRole.MEDICAL_STUDENT, CampusRole.LAW_STUDENT, CampusRole.PARENT] } } } },
      select: { id: true },
    });
    if (!employee) throw new AuthenticationError("Choose an active, verified college employee.", 404);
    const membership = await prisma.$transaction(async (tx) => {
      const created = await tx.membership.create({ data: {
        institutionId, userId: employee.id, role, status: MembershipStatus.ACTIVE,
      } });
      await tx.auditEvent.create({ data: { institutionId, actorId: session.userId,
        action: "administration.employee.role_assigned", entityType: "Membership",
        entityId: created.id, metadata: { role } } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ membership, message: "Employee role assigned." }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "The employee already has this role." }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}

// Suspension invalidates sessions tied to the membership immediately.
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(managers);
    const input = await readJsonObject(request);
    const membershipId = requiredText(input.membershipId, "Membership", 5, 100);
    const status = input.status;
    if (status !== MembershipStatus.ACTIVE && status !== MembershipStatus.SUSPENDED) {
      throw new AuthenticationError("Choose active or suspended.", 400);
    }
    const institutionId = session.membership.institutionId;
    const target = await prisma.membership.findFirst({ where: { id: membershipId, institutionId },
      select: { id: true, userId: true, role: true, status: true },
    });
    if (!target || target.status === MembershipStatus.INVITED) {
      throw new AuthenticationError("Existing active or suspended membership not found.", 404);
    }
    if (target.role === CampusRole.SUPER_ADMIN || target.userId === session.userId) {
      throw new AuthenticationError("You cannot change your own membership or a Super Admin membership here.", 403);
    }
    if (privileged.has(target.role) && session.membership.role !== CampusRole.SUPER_ADMIN) {
      throw new AuthenticationError("Only the Super Admin can manage this privileged role.", 403);
    }
    await prisma.$transaction(async (tx) => {
      await tx.membership.update({ where: { id: target.id }, data: { status } });
      await tx.auditEvent.create({ data: { institutionId, actorId: session.userId,
        action: status === MembershipStatus.SUSPENDED ? "administration.membership.suspended" : "administration.membership.reactivated",
        entityType: "Membership", entityId: target.id, metadata: { role: target.role } } });
    });
    return Response.json({ message: status === MembershipStatus.ACTIVE ? "Membership reactivated." : "Membership suspended." });
  } catch (error) { return authErrorResponse(error); }
}
