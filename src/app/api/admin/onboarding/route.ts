import { createHash, randomBytes } from "node:crypto";
import { CampusRole, MembershipStatus, Prisma } from "@prisma/client";
import { assertSameOrigin, AuthenticationError, authErrorResponse, normalizeEmail, requireSession } from "@/lib/auth";
import { readJsonObject, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const staffRoles = new Set<CampusRole>([
  CampusRole.PRINCIPAL, CampusRole.FACULTY, CampusRole.TEACHER,
  CampusRole.STAFF, CampusRole.OFFICE_STAFF, CampusRole.DEPARTMENT_HEAD,
  CampusRole.DEPARTMENT_CHAIR, CampusRole.LIBRARIAN, CampusRole.HR,
  CampusRole.EXAM_CONTROLLER, CampusRole.ACCOUNTANT, CampusRole.FINANCE_ADMIN,
]);
const registrarRoles: CampusRole[] = [
  CampusRole.SUPER_ADMIN, CampusRole.PRINCIPAL, CampusRole.REGISTRAR, CampusRole.UNIVERSITY_ADMIN,
];
const staffApprovalRoles: CampusRole[] = [CampusRole.SUPER_ADMIN, CampusRole.PRINCIPAL];
const codeLifetime = 7 * 24 * 60 * 60 * 1000;

function newStudentCode() {
  const code = randomBytes(18).toString("base64url");
  return { code, hash: createHash("sha256").update(code).digest("hex"), expiresAt: new Date(Date.now() + codeLifetime) };
}

export async function GET() {
  try {
    const session = await requireSession(registrarRoles);
    const institutionId = session.membership.institutionId;
    const [programs, students, staff] = await Promise.all([
      prisma.program.findMany({
        where: { department: { institutionId } },
        select: { id: true, name: true, code: true, department: { select: { name: true } } },
        orderBy: { name: "asc" }, take: 200,
      }),
      prisma.studentProfile.findMany({
        where: { user: { memberships: { some: { institutionId, role: CampusRole.STUDENT, status: MembershipStatus.INVITED } } } },
        select: { studentNumber: true, activationExpiresAt: true, user: { select: { name: true } } },
        orderBy: { createdAt: "desc" }, take: 100,
      }),
      prisma.membership.findMany({
        where: { institutionId, status: MembershipStatus.INVITED, role: { in: [...staffRoles] } },
        select: { id: true, role: true, user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" }, take: 100,
      }),
    ]);
    return Response.json({ programs, students, staff,
      canApproveStaff: staffApprovalRoles.includes(session.membership.role) });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(registrarRoles);
    const input = await readJsonObject(request);
    const name = requiredText(input.name, "Full name", 2, 120);
    const institutionId = session.membership.institutionId;
    if (input.kind === "student") {
      const studentNumber = requiredText(input.studentNumber, "Student ID", 2, 50);
      const programId = requiredText(input.programId, "Program", 5, 100);
      const program = await prisma.program.findFirst({
        where: { id: programId, department: { institutionId } }, select: { id: true },
      });
      if (!program) throw new AuthenticationError("Choose a program belonging to Siddheswari College.", 400);
      const activation = newStudentCode();
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { name } });
        await tx.studentProfile.create({
          data: { userId: user.id, programId, studentNumber,
            activationCodeHash: activation.hash, activationExpiresAt: activation.expiresAt },
        });
        await tx.membership.create({
          data: { institutionId, userId: user.id, role: CampusRole.STUDENT, status: MembershipStatus.INVITED },
        });
        await tx.auditEvent.create({
          data: { institutionId, actorId: session.userId, action: "identity.student.issued",
            entityType: "StudentProfile", entityId: user.id, metadata: { studentNumber } },
        });
      });
      return Response.json({ studentNumber, activationCode: activation.code, expiresAt: activation.expiresAt },
        { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    if (input.kind === "staff") {
      if (!staffApprovalRoles.includes(session.membership.role)) {
        throw new AuthenticationError("Only the principal or super administrator may authorize employee Gmail accounts.", 403);
      }
      const email = normalizeEmail(requiredText(input.email, "Gmail address", 5, 254));
      if (!/^[^\s@]+@gmail\.com$/.test(email)) {
        throw new AuthenticationError("Staff registration requires a valid Gmail address.", 400);
      }
      const role = typeof input.role === "string" && staffRoles.has(input.role as CampusRole)
        ? input.role as CampusRole : null;
      if (!role) throw new AuthenticationError("Choose an approved employee role.", 400);
      if (role === CampusRole.PRINCIPAL && session.membership.role !== CampusRole.SUPER_ADMIN) {
        throw new AuthenticationError("Only the super administrator may authorize a principal.", 403);
      }
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
      if (existing?.passwordHash) {
        throw new AuthenticationError("This Gmail account is already registered. Manage its roles from administration.", 409);
      }
      await prisma.$transaction(async (tx) => {
        const user = existing
          ? await tx.user.update({ where: { id: existing.id }, data: { name } })
          : await tx.user.create({ data: { name, email } });
        await tx.membership.create({
          data: { institutionId, userId: user.id, role, status: MembershipStatus.INVITED },
        });
        await tx.auditEvent.create({
          data: { institutionId, actorId: session.userId, action: "identity.staff.email_preapproved",
            entityType: "User", entityId: user.id, metadata: { role } },
        });
      });
      return Response.json({ message: "Gmail approved. The employee can now verify it and choose a password." }, { status: 201 });
    }
    throw new AuthenticationError("Choose student or staff onboarding.", 400);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "This student ID or staff role is already registered." }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}

// Registrars can replace an expired or misplaced, unused student activation code.
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(registrarRoles);
    const input = await readJsonObject(request);
    const studentNumber = requiredText(input.studentNumber, "Student ID", 2, 50);
    const student = await prisma.studentProfile.findFirst({
      where: { studentNumber, user: {
        passwordHash: null,
        memberships: { some: { institutionId: session.membership.institutionId,
          role: CampusRole.STUDENT, status: MembershipStatus.INVITED } },
      } },
      select: { userId: true },
    });
    if (!student) throw new AuthenticationError("Pending student ID not found.", 404);
    const activation = newStudentCode();
    await prisma.$transaction([
      prisma.studentProfile.update({ where: { userId: student.userId },
        data: { activationCodeHash: activation.hash, activationExpiresAt: activation.expiresAt } }),
      prisma.auditEvent.create({ data: { institutionId: session.membership.institutionId,
        actorId: session.userId, action: "identity.student.activation_rotated",
        entityType: "StudentProfile", entityId: student.userId } }),
    ]);
    return Response.json({ studentNumber, activationCode: activation.code, expiresAt: activation.expiresAt },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return authErrorResponse(error); }
}
