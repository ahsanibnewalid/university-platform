import { createHash, randomBytes } from "node:crypto";
import { IdentityActivationPurpose, MembershipStatus, Prisma } from "@prisma/client";
import {
  assertSameOrigin, AuthenticationError, authErrorResponse, createSession,
  hashPassword, normalizeEmail,
} from "@/lib/auth";
import { readJsonObject, requiredText } from "@/lib/api";
import { sendAccountEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

const purpose = IdentityActivationPurpose.STAFF_SIGNUP;
const genericMessage = "If the Gmail address is approved by Siddheswari College, a verification link will be sent.";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (token.length < 32 || token.length > 200) throw new AuthenticationError("Link is invalid or expired.", 400);
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const pending = await prisma.identityActivation.findFirst({
      where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: new Date() } },
      select: { email: true, user: { select: { name: true, passwordHash: true } } },
    });
    if (!pending || pending.user.passwordHash) throw new AuthenticationError("Link is invalid or expired.", 400);
    return Response.json({ name: pending.user.name, email: pending.email },
      { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return authErrorResponse(error); }
}

// An approved employee starts signup by Gmail. This does not grant any campus role.
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await readJsonObject(request);
    const email = normalizeEmail(requiredText(input.email, "Gmail address", 5, 254));
    if (!/^[^\s@]+@gmail\.com$/.test(email)) {
      throw new AuthenticationError("Use the Gmail address approved by the college.", 400);
    }
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.APP_URL) {
      throw new AuthenticationError("Staff email verification is not configured yet.", 503);
    }
    if (process.env.NODE_ENV === "production" && !process.env.APP_URL.startsWith("https://")) {
      throw new AuthenticationError("Configure the college's HTTPS domain before Gmail activation.", 503);
    }
    const account = await prisma.user.findUnique({
      where: { email }, select: { id: true, name: true, passwordHash: true,
        memberships: { where: { status: MembershipStatus.INVITED,
          role: { notIn: ["STUDENT", "MEDICAL_STUDENT", "LAW_STUDENT", "PARENT"] } },
          select: { id: true }, take: 1 },
      },
    });
    if (!account || account.passwordHash || !account.memberships.length) {
      return Response.json({ message: genericMessage });
    }
    const requested = await prisma.identityActivation.count({ where: {
      userId: account.id, purpose, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
    } });
    if (requested >= 3) return Response.json({ message: genericMessage });
    const token = randomBytes(32).toString("base64url");
    await prisma.identityActivation.create({ data: {
      userId: account.id, email, purpose,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    } });
    await sendAccountEmail(email, "Verify your Siddheswari College staff account",
      "Complete staff registration",
      "Your college-approved Gmail account can be activated by choosing a password. This link expires in 30 minutes.",
      "Verify Gmail and set password",
      `${process.env.APP_URL}/staff/activate?token=${encodeURIComponent(token)}`);
    return Response.json({ message: genericMessage });
  } catch (error) { return authErrorResponse(error); }
}

// Only the holder of the verified Gmail link can set the initial password.
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await readJsonObject(request);
    const token = requiredText(input.token, "Verification token", 32, 200);
    if (typeof input.password !== "string") throw new AuthenticationError("Choose a password.", 400);
    const passwordHash = await hashPassword(input.password);
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const verified = await prisma.$transaction(async (tx) => {
      const pending = await tx.identityActivation.findFirst({
        where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: new Date() } },
        include: { user: { select: { id: true, email: true, passwordHash: true,
          memberships: { where: { status: MembershipStatus.INVITED,
            role: { notIn: ["STUDENT", "MEDICAL_STUDENT", "LAW_STUDENT", "PARENT"] } }, take: 1 },
        } } },
      });
      const membership = pending?.user.memberships[0];
      if (!pending || !membership || pending.user.passwordHash || pending.user.email !== pending.email) {
        throw new AuthenticationError("Link is invalid or expired.", 400);
      }
      const consumed = await tx.identityActivation.updateMany({
        where: { id: pending.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      const updated = await tx.user.updateMany({
        where: { id: pending.userId, passwordHash: null },
        data: { passwordHash, emailVerified: new Date() },
      });
      const active = await tx.membership.updateMany({
        where: { id: membership.id, status: MembershipStatus.INVITED },
        data: { status: MembershipStatus.ACTIVE },
      });
      if (consumed.count !== 1 || updated.count !== 1 || active.count !== 1) {
        throw new AuthenticationError("Staff registration has already been completed.", 409);
      }
      await tx.auditEvent.create({ data: { institutionId: membership.institutionId,
        actorId: pending.userId, action: "identity.staff.gmail_verified",
        entityType: "Membership", entityId: membership.id } });
      return { userId: pending.userId, membershipId: membership.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await createSession(verified.userId, verified.membershipId, request.headers.get("user-agent"));
    return Response.json({ message: "Staff registration completed." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return authErrorResponse(error); }
}
