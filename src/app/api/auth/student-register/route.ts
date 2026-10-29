import { createHash } from "node:crypto";
import { CampusRole, MembershipStatus, Prisma } from "@prisma/client";
import {
  assertSameOrigin, AuthenticationError, authErrorResponse, createSession,
  hashLoginIdentifier, hashPassword,
} from "@/lib/auth";
import { readJsonObject, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await readJsonObject(request);
    const studentNumber = requiredText(input.studentNumber, "Student ID", 2, 50);
    const code = requiredText(input.activationCode, "College activation code", 20, 120);
    if (typeof input.password !== "string") {
      throw new AuthenticationError("Choose a password.", 400);
    }
    const attemptHash = hashLoginIdentifier(`activate:${studentNumber}`);
    const attempts = await prisma.loginAttempt.count({ where: {
      emailHash: attemptHash, succeeded: false,
      attemptedAt: { gt: new Date(Date.now() - 15 * 60 * 1000) },
    } });
    if (attempts >= 8) throw new AuthenticationError("Too many attempts. Try again in 15 minutes.", 429);

    const tokenHash = createHash("sha256").update(code).digest("hex");
    const profile = await prisma.studentProfile.findUnique({
      where: { studentNumber },
      select: { userId: true, activationCodeHash: true, activationExpiresAt: true,
        user: { select: { passwordHash: true, memberships: { where: {
          role: { in: [CampusRole.STUDENT, CampusRole.MEDICAL_STUDENT, CampusRole.LAW_STUDENT] },
          status: MembershipStatus.INVITED }, select: { id: true, institutionId: true }, take: 1 } } },
      },
    });
    const membership = profile?.user.memberships[0];
    if (!profile || !membership || profile.user.passwordHash ||
      profile.activationCodeHash !== tokenHash ||
      !profile.activationExpiresAt || profile.activationExpiresAt <= new Date()) {
      await prisma.loginAttempt.create({ data: { emailHash: attemptHash } });
      throw new AuthenticationError("Student ID or activation code is invalid or expired.", 400);
    }
    const passwordHash = await hashPassword(input.password);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const used = await tx.studentProfile.updateMany({
        where: { userId: profile.userId, activationCodeHash: tokenHash,
          activationExpiresAt: { gt: now } },
        data: { activationCodeHash: null, activationExpiresAt: null },
      });
      const changed = await tx.user.updateMany({
        where: { id: profile.userId, passwordHash: null }, data: { passwordHash },
      });
      const activated = await tx.membership.updateMany({
        where: { id: membership.id, status: MembershipStatus.INVITED },
        data: { status: MembershipStatus.ACTIVE },
      });
      if (used.count !== 1 || changed.count !== 1 || activated.count !== 1) {
        throw new AuthenticationError("Student activation was already completed. Contact the college office.", 409);
      }
      await tx.auditEvent.create({ data: { institutionId: membership.institutionId,
        actorId: profile.userId, action: "identity.student.activated_by_id",
        entityType: "Membership", entityId: membership.id } });
      await tx.loginAttempt.create({ data: { emailHash: attemptHash, succeeded: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await createSession(profile.userId, membership.id, request.headers.get("user-agent"));
    return Response.json({ message: "Student account activated.", needsStudentEmail: true },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return authErrorResponse(error); }
}
