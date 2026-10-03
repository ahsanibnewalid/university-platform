import {
  AuthenticationError,
  assertSameOrigin,
  authErrorResponse,
  getCurrentSession,
} from "@/lib/auth";
import { readJsonObject, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return Response.json({ user: null, institution: null, role: null });
    }
    return Response.json({
      user: session.user,
      institution: session.membership.institution,
      membershipId: session.membership.id,
      role: session.membership.role,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await getCurrentSession();
    if (!session) throw new AuthenticationError("Sign in to continue.", 401);
    const input = await readJsonObject(request);
    const membershipId = requiredText(input.membershipId, "Campus role", 1, 100);
    const membership = await prisma.membership.findFirst({
      where: {
        id: membershipId,
        userId: session.userId,
        status: "ACTIVE",
      },
      select: { id: true, institutionId: true, role: true },
    });
    if (!membership) {
      throw new AuthenticationError("That is not an active campus role on your account.", 403);
    }
    await prisma.$transaction([
      prisma.authSession.update({
        where: { id: session.id },
        data: { membershipId: membership.id },
      }),
      prisma.auditEvent.create({
        data: {
          institutionId: membership.institutionId,
          actorId: session.userId,
          action: "auth.membership.switched",
          entityType: "Membership",
          entityId: membership.id,
        },
      }),
    ]);
    return Response.json({
      membershipId: membership.id,
      institutionId: membership.institutionId,
      role: membership.role,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
