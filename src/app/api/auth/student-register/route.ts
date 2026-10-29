import { CampusRole, MembershipStatus, Prisma, StudentRegistrationStatus } from "@prisma/client";
import {
  assertSameOrigin, AuthenticationError, authErrorResponse, hashLoginIdentifier, hashPassword,
} from "@/lib/auth";
import { readJsonObject, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const submittedMessage = "Your request has been received. A college registrar must verify your identity and approve the account before you can sign in.";

// Student IDs must already be on the college roster. A password submission
// never grants campus access; only an authorized reviewer can activate it.
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await readJsonObject(request);
    const studentNumber = requiredText(input.studentNumber, "Student ID", 2, 50);
    if (typeof input.password !== "string") throw new AuthenticationError("Choose a password.", 400);
    const passwordHash = await hashPassword(input.password);
    const attemptHash = hashLoginIdentifier(`registration:${studentNumber}`);
    const attempts = await prisma.loginAttempt.count({ where: {
      emailHash: attemptHash, succeeded: false,
      attemptedAt: { gt: new Date(Date.now() - 15 * 60 * 1000) },
    } });
    if (attempts >= 8) throw new AuthenticationError("Too many attempts. Try again in 15 minutes.", 429);

    const profile = await prisma.studentProfile.findUnique({
      where: { studentNumber },
      select: { userId: true, registrationStatus: true,
        user: { select: { passwordHash: true,
          memberships: { where: {
            role: { in: [CampusRole.STUDENT, CampusRole.MEDICAL_STUDENT, CampusRole.LAW_STUDENT] },
            status: MembershipStatus.INVITED,
          }, select: { id: true, institutionId: true }, take: 1 },
        } },
      },
    });
    const membership = profile?.user.memberships[0];
    if (!profile || !membership || profile.user.passwordHash ||
      (profile.registrationStatus !== StudentRegistrationStatus.NOT_REQUESTED &&
        profile.registrationStatus !== StudentRegistrationStatus.REJECTED)) {
      await prisma.loginAttempt.create({ data: { emailHash: attemptHash } });
      return Response.json({ message: submittedMessage }, { status: 202, headers: { "Cache-Control": "no-store" } });
    }

    await prisma.$transaction(async (tx) => {
      const changed = await tx.studentProfile.updateMany({ where: {
        userId: profile.userId,
        registrationStatus: { in: [StudentRegistrationStatus.NOT_REQUESTED, StudentRegistrationStatus.REJECTED] },
      }, data: {
        registrationStatus: StudentRegistrationStatus.PENDING,
        registrationRequestedAt: new Date(), registrationReviewedAt: null, registrationReviewedById: null,
        activationCodeHash: null, activationExpiresAt: null,
      } });
      const password = await tx.user.updateMany({
        where: { id: profile.userId, passwordHash: null }, data: { passwordHash },
      });
      if (changed.count !== 1 || password.count !== 1) {
        throw new AuthenticationError("Registration was already submitted. Contact the registrar office.", 409);
      }
      await tx.auditEvent.create({ data: {
        institutionId: membership.institutionId,
        action: "identity.student.registration_requested",
        entityType: "StudentProfile", entityId: profile.userId,
      } });
      await tx.loginAttempt.create({ data: { emailHash: attemptHash, succeeded: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return Response.json({ message: submittedMessage }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return authErrorResponse(error); }
}
