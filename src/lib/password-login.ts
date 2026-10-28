import { MembershipStatus } from "@prisma/client";
import { AuthenticationError, hashLoginIdentifier, normalizeEmail, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Web and native sign-ins share one lockout, membership check and audit trail.
const dummyPasswordHash = `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;

export async function authenticateCampusCredentials(input: Record<string, unknown>, channel: "web" | "mobile") {
  if (
    typeof input.email !== "string" || typeof input.password !== "string" ||
    input.email.length > 254 || input.password.length > 128
  ) throw new AuthenticationError("Email and password are required.", 400);

  const email = normalizeEmail(input.email);
  const emailHash = hashLoginIdentifier(email);
  const attemptWindow = new Date(Date.now() - 15 * 60 * 1000);
  const failedAttempts = await prisma.loginAttempt.count({
    where: { emailHash, succeeded: false, attemptedAt: { gt: attemptWindow } },
  });
  if (failedAttempts >= 8) {
    throw new AuthenticationError("Too many sign-in attempts. Please try again in 15 minutes.", 429);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: {
        where: { status: MembershipStatus.ACTIVE },
        include: { institution: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  const validPassword = await verifyPassword(input.password, user?.passwordHash ?? dummyPasswordHash);
  const membership = user?.memberships.find((item) =>
    typeof input.membershipId !== "string" || item.id === input.membershipId,
  );
  if (!user || !validPassword || !membership) {
    await prisma.loginAttempt.create({ data: { emailHash } });
    throw new AuthenticationError("Email or password is incorrect.", 401);
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
  return { user, membership };
}
