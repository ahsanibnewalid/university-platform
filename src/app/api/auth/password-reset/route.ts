import { createHash, randomBytes } from "node:crypto";
import { AuthenticationError, authErrorResponse, assertSameOrigin, hashPassword, normalizeEmail } from "@/lib/auth";
import { readJsonObject, requiredText } from "@/lib/api";
import { sendAccountEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await readJsonObject(request);
    const email = normalizeEmail(requiredText(input.email, "Email", 5, 254));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AuthenticationError("Enter a valid email address.", 400);
    }
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.APP_URL) {
      throw new AuthenticationError(
        "Password reset is unavailable until account email delivery is configured.",
        503,
      );
    }
    const recentRequests = await prisma.passwordResetToken.count({
      where: {
        user: { email },
        createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recentRequests >= 3) {
      return Response.json({
        message: "If the account exists, password reset instructions will be sent.",
      });
    }
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });
    if (user) {
      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
      await sendAccountEmail(
        user.email,
        "Reset your CampusHub password",
        "Reset your password",
        "Use this one-time link to choose a new password. It expires in 30 minutes.",
        "Reset password",
        `${process.env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`,
      );
    }
    return Response.json({
      message: "If the account exists, password reset instructions will be sent.",
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await readJsonObject(request);
    const token = requiredText(input.token, "Reset token", 20, 200);
    if (typeof input.password !== "string") {
      throw new AuthenticationError("A new password is required.", 400);
    }
    const passwordHash = await hashPassword(input.password);
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await prisma.$transaction(async (tx) => {
      const reset = await tx.passwordResetToken.findFirst({
        where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, userId: true },
      });
      if (!reset) throw new AuthenticationError("Reset link is invalid or expired.", 400);
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (!consumed.count) throw new AuthenticationError("Reset link has already been used.", 409);
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash },
      });
      await tx.authSession.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: reset.userId, id: { not: reset.id }, usedAt: null },
        data: { usedAt: new Date() },
      });
    });
    return Response.json({ message: "Password has been updated. Sign in with your new password." });
  } catch (error) {
    return authErrorResponse(error);
  }
}
