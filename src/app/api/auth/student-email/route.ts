import { createHash, randomBytes } from "node:crypto";
import { IdentityActivationPurpose, Prisma } from "@prisma/client";
import {
  assertSameOrigin, AuthenticationError, authErrorResponse,
  normalizeEmail, requireSession,
} from "@/lib/auth";
import { readJsonObject, requiredText, studentRoles } from "@/lib/api";
import { sendAccountEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

const purpose = IdentityActivationPurpose.STUDENT_EMAIL;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(studentRoles);
    const input = await readJsonObject(request);
    const email = normalizeEmail(requiredText(input.email, "Gmail address", 5, 254));
    if (!/^[^\s@]+@gmail\.com$/.test(email)) {
      throw new AuthenticationError("Enter a valid Gmail address.", 400);
    }
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.APP_URL) {
      throw new AuthenticationError("Gmail verification is unavailable until college email delivery is configured.", 503);
    }
    if (process.env.NODE_ENV === "production" && !process.env.APP_URL.startsWith("https://")) {
      throw new AuthenticationError("Configure the college's HTTPS domain before Gmail activation.", 503);
    }
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing && existing.id !== session.userId) {
      throw new AuthenticationError("This Gmail address is already used by another account.", 409);
    }
    if (session.user.email === email && session.user.emailVerified) {
      return Response.json({ message: "This Gmail address is already linked to your student account." });
    }
    const requests = await prisma.identityActivation.count({ where: {
      userId: session.userId, purpose,
      createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
    } });
    if (requests >= 3) throw new AuthenticationError("Too many requests. Try again later.", 429);
    const token = randomBytes(32).toString("base64url");
    await prisma.identityActivation.create({ data: {
      userId: session.userId, purpose, email,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    } });
    await sendAccountEmail(email, "Verify your Siddheswari College student Gmail",
      "Verify student Gmail",
      "Confirm this Gmail address to enable email notifications, password recovery, and other connected services.",
      "Verify my Gmail",
      `${process.env.APP_URL}/student/email?token=${encodeURIComponent(token)}`);
    return Response.json({ message: "Verification instructions have been sent to your Gmail address." });
  } catch (error) { return authErrorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(studentRoles);
    const input = await readJsonObject(request);
    const token = requiredText(input.token, "Email verification token", 32, 200);
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await prisma.$transaction(async (tx) => {
      const pending = await tx.identityActivation.findFirst({
        where: { tokenHash, purpose, userId: session.userId,
          usedAt: null, expiresAt: { gt: new Date() } },
      });
      if (!pending) throw new AuthenticationError("Verification link is invalid or expired.", 400);
      const used = await tx.identityActivation.updateMany({
        where: { id: pending.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1) throw new AuthenticationError("Verification link has already been used.", 409);
      await tx.user.update({ where: { id: session.userId },
        data: { email: pending.email, emailVerified: new Date() } });
      await tx.identityActivation.updateMany({ where: { userId: session.userId,
        purpose, usedAt: null }, data: { usedAt: new Date() } });
      await tx.auditEvent.create({ data: { institutionId: session.membership.institutionId,
        actorId: session.userId, action: "identity.student.gmail_verified",
        entityType: "User", entityId: session.userId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ message: "Gmail verified and linked to your student ID." });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "This Gmail address is already linked to another account." }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}
