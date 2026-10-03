import { createHash } from "node:crypto";
import { MembershipStatus } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  createSession,
  hashPassword,
} from "@/lib/auth";
import { readJsonObject, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (token.length < 20 || token.length > 200) {
      throw new AuthenticationError("Invitation is invalid or expired.", 400);
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const invitation = await prisma.invitation.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      select: {
        user: { select: { passwordHash: true } },
        membership: { select: { status: true, institution: { select: { name: true } } } },
      },
    });
    if (!invitation || invitation.membership.status !== MembershipStatus.INVITED) {
      throw new AuthenticationError("Invitation is invalid or expired.", 400);
    }
    return Response.json({
      passwordRequired: !invitation.user.passwordHash,
      institutionName: invitation.membership.institution.name,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await readJsonObject(request);
    const token = requiredText(input.token, "Invitation", 20, 200);
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const invitation = await prisma.invitation.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      include: {
        user: { select: { id: true, passwordHash: true } },
        membership: { select: { id: true, status: true } },
      },
    });
    if (!invitation || invitation.membership.status !== MembershipStatus.INVITED) {
      throw new AuthenticationError("Invitation is invalid or expired.", 400);
    }
    const passwordHash = invitation.user.passwordHash
      ? undefined
      : await hashPassword(
          typeof input.password === "string" ? input.password : "",
        );
    const accepted = await prisma.$transaction(async (tx) => {
      const consumed = await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new AuthenticationError("Invitation has already been used.", 409);
      }
      const user = await tx.user.update({
        where: { id: invitation.user.id },
        data: { ...(passwordHash ? { passwordHash } : {}), emailVerified: new Date() },
        select: { id: true, name: true },
      });
      const membership = await tx.membership.update({
        where: { id: invitation.membership.id },
        data: { status: MembershipStatus.ACTIVE },
        select: { id: true, institutionId: true, role: true },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: membership.institutionId,
          actorId: user.id,
          action: "identity.membership.accepted",
          entityType: "Membership",
          entityId: membership.id,
        },
      });
      return { user, membership };
    });
    await createSession(accepted.user.id, accepted.membership.id, request.headers.get("user-agent"));
    return Response.json({ user: accepted.user, role: accepted.membership.role });
  } catch (error) {
    return authErrorResponse(error);
  }
}
