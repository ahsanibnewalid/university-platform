import { CampusRole, MembershipStatus, Prisma, StudentRegistrationStatus } from "@prisma/client";
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
  CampusRole.SUPER_ADMIN, CampusRole.PRINCIPAL, CampusRole.REGISTRAR,
  CampusRole.UNIVERSITY_ADMIN, CampusRole.STUDENT_AFFAIRS,
];
const staffApprovalRoles: CampusRole[] = [CampusRole.SUPER_ADMIN, CampusRole.PRINCIPAL];
const departmentReviewRoles: CampusRole[] = [CampusRole.DEPARTMENT_CHAIR, CampusRole.DEPARTMENT_HEAD];
const reviewRoles = [...registrarRoles, ...departmentReviewRoles];

function departmentRestriction(role: CampusRole, userId: string) {
  return departmentReviewRoles.includes(role) ? { chairId: userId } : {};
}

export async function GET() {
  try {
    const session = await requireSession(reviewRoles);
    const institutionId = session.membership.institutionId;
    const programWhere = { department: { institutionId, ...departmentRestriction(session.membership.role, session.userId) } };
    const [programs, students, staff] = await Promise.all([
      prisma.program.findMany({
        where: programWhere,
        select: { id: true, name: true, code: true, department: { select: { name: true } } },
        orderBy: { name: "asc" }, take: 200,
      }),
      prisma.studentProfile.findMany({
        where: { registrationStatus: { in: [StudentRegistrationStatus.NOT_REQUESTED, StudentRegistrationStatus.PENDING, StudentRegistrationStatus.REJECTED] },
          program: programWhere,
          user: { memberships: { some: { institutionId, role: CampusRole.STUDENT, status: MembershipStatus.INVITED } } } },
        select: { studentNumber: true, registrationStatus: true, registrationRequestedAt: true,
          program: { select: { name: true } }, user: { select: { name: true } } },
        orderBy: { registrationRequestedAt: { sort: "desc", nulls: "last" } }, take: 150,
      }),
      prisma.membership.findMany({
        where: { institutionId, status: MembershipStatus.INVITED, role: { in: [...staffRoles] } },
        select: { id: true, role: true, user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" }, take: 100,
      }),
    ]);
    return Response.json({ programs, students, staff: staffApprovalRoles.includes(session.membership.role) ? staff : [],
      canApproveStaff: staffApprovalRoles.includes(session.membership.role) });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(reviewRoles);
    const input = await readJsonObject(request);
    const name = requiredText(input.name, "Full name", 2, 120);
    const institutionId = session.membership.institutionId;
    if (input.kind === "student") {
      const studentNumber = requiredText(input.studentNumber, "Student ID", 2, 50);
      const programId = requiredText(input.programId, "Program", 5, 100);
      const program = await prisma.program.findFirst({
        where: { id: programId, department: { institutionId,
          ...departmentRestriction(session.membership.role, session.userId) } }, select: { id: true },
      });
      if (!program) throw new AuthenticationError("Choose a program belonging to Siddheswari College.", 400);
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { name } });
        await tx.studentProfile.create({
          data: { userId: user.id, programId, studentNumber },
        });
        await tx.membership.create({
          data: { institutionId, userId: user.id, role: CampusRole.STUDENT, status: MembershipStatus.INVITED },
        });
        await tx.auditEvent.create({
          data: { institutionId, actorId: session.userId, action: "identity.student.roster_created",
            entityType: "StudentProfile", entityId: user.id, metadata: { studentNumber } },
        });
      });
      return Response.json({ studentNumber, message: "Student ID added to the college roster. The student can now submit their password for review." },
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

// An authorized reviewer must verify the student's identity against college
// records before approving a pending request. Department leads are scoped to
// the department for which they have a chair appointment.
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(reviewRoles);
    const input = await readJsonObject(request);
    const studentNumber = requiredText(input.studentNumber, "Student ID", 2, 50);
    const action = input.action;
    if (action !== "approve" && action !== "reject") throw new AuthenticationError("Choose approve or reject.", 400);
    if (action === "approve" && input.identityVerified !== true) {
      throw new AuthenticationError("Confirm that you verified the student against official college records before approval.", 400);
    }
    const student = await prisma.studentProfile.findFirst({
      where: { studentNumber, user: {
        memberships: { some: { institutionId: session.membership.institutionId,
          role: CampusRole.STUDENT, status: MembershipStatus.INVITED } },
      }, program: { department: { institutionId: session.membership.institutionId,
        ...departmentRestriction(session.membership.role, session.userId) } },
        registrationStatus: StudentRegistrationStatus.PENDING },
      select: { userId: true, user: { select: { passwordHash: true,
        memberships: { where: { institutionId: session.membership.institutionId,
          role: CampusRole.STUDENT, status: MembershipStatus.INVITED }, select: { id: true }, take: 1 } } } },
    });
    const membershipId = student?.user.memberships[0]?.id;
    if (!student || !student.user.passwordHash || !membershipId) {
      throw new AuthenticationError("A pending registration for this college student was not found.", 404);
    }
    await prisma.$transaction(async (tx) => {
      const changed = await tx.studentProfile.updateMany({ where: {
        userId: student.userId, registrationStatus: StudentRegistrationStatus.PENDING,
      }, data: {
        registrationStatus: action === "approve" ? StudentRegistrationStatus.APPROVED : StudentRegistrationStatus.REJECTED,
        registrationReviewedAt: new Date(), registrationReviewedById: session.userId,
      } });
      if (changed.count !== 1) throw new AuthenticationError("This registration has already been reviewed.", 409);
      if (action === "approve") {
        const active = await tx.membership.updateMany({ where: { id: membershipId, status: MembershipStatus.INVITED },
          data: { status: MembershipStatus.ACTIVE } });
        if (active.count !== 1) throw new AuthenticationError("This registration has already been reviewed.", 409);
      } else {
        await tx.user.update({ where: { id: student.userId }, data: { passwordHash: null } });
      }
      await tx.auditEvent.create({ data: {
        institutionId: session.membership.institutionId, actorId: session.userId,
        action: action === "approve" ? "identity.student.registration_approved" : "identity.student.registration_rejected",
        entityType: "StudentProfile", entityId: student.userId, metadata: { studentNumber },
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ message: action === "approve" ? "Student registration approved. The student may sign in by ID and password." : "Request rejected. The student may submit a new request." });
  } catch (error) { return authErrorResponse(error); }
}
