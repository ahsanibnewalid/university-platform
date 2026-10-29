import { CampusRole, MembershipStatus, StudentRegistrationStatus } from "@prisma/client";
import { AuthenticationError, hashLoginIdentifier, normalizeEmail, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Web and native sign-ins share one lockout, membership check and audit trail.
const dummyPasswordHash = `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;
const studentRoles = new Set<CampusRole>([
  CampusRole.STUDENT, CampusRole.MEDICAL_STUDENT, CampusRole.LAW_STUDENT,
]);

export async function authenticateCampusCredentials(input: Record<string, unknown>, channel: "web" | "mobile") {
  const submittedIdentifier = input.identifier ?? input.email;
  if (
    typeof submittedIdentifier !== "string" || typeof input.password !== "string" ||
    submittedIdentifier.length > 254 || input.password.length > 128
  ) throw new AuthenticationError("Student ID or email and password are required.", 400);

  const identifier = submittedIdentifier.trim();
  if (!identifier || identifier.length < 2) {
    throw new AuthenticationError("Student ID or email and password are required.", 400);
  }
  const emailLogin = identifier.includes("@");
  const normalized = emailLogin ? normalizeEmail(identifier) : identifier;
  const emailHash = hashLoginIdentifier(`${emailLogin ? "staff" : "student"}:${normalized}`);
  const attemptWindow = new Date(Date.now() - 15 * 60 * 1000);
  const failedAttempts = await prisma.loginAttempt.count({
    where: { emailHash, succeeded: false, attemptedAt: { gt: attemptWindow } },
  });
  if (failedAttempts >= 8) {
    throw new AuthenticationError("Too many sign-in attempts. Please try again in 15 minutes.", 429);
  }

  const withMembership = {
    memberships: {
      where: { status: MembershipStatus.ACTIVE },
      include: { institution: true },
      orderBy: { createdAt: "asc" as const },
    },
  };
  const student = !emailLogin ? await prisma.studentProfile.findUnique({
    where: { studentNumber: normalized },
    include: { user: { include: withMembership } },
  }) : null;
  const user = emailLogin
    ? await prisma.user.findUnique({ where: { email: normalized }, include: withMembership })
    : student?.user;
  const validPassword = await verifyPassword(input.password, user?.passwordHash ?? dummyPasswordHash);
  const membership = user?.memberships.find((item) =>
    (emailLogin ? !studentRoles.has(item.role) : studentRoles.has(item.role)) &&
    (typeof input.membershipId !== "string" || item.id === input.membershipId),
  );
  if (user && validPassword && !membership && student?.registrationStatus === StudentRegistrationStatus.PENDING) {
    throw new AuthenticationError("Your student registration is waiting for college approval.", 403);
  }
  if (!user || !validPassword || !membership) {
    await prisma.loginAttempt.create({ data: { emailHash } });
    throw new AuthenticationError("ID or email and password are incorrect.", 401);
  }

  await prisma.$transaction([
    prisma.loginAttempt.create({ data: { emailHash, succeeded: true } }),
    prisma.auditEvent.create({
      data: {
        institutionId: membership.institutionId, actorId: user.id,
        action: channel === "mobile" ? "auth.mobile.login" : "auth.login",
        entityType: "AuthSession",
      },
    }),
  ]);
  return { user, membership, needsStudentEmail: !emailLogin && (!user.email || !user.emailVerified) };
}
