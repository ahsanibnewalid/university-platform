import { createHash, randomBytes } from "node:crypto";
import { CampusRole } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { administrativeRoles, recordAudit } from "@/lib/api";
import { sendAccountEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ membershipId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(administrativeRoles);
    const { membershipId } = await context.params;
    const membership = await prisma.membership.findFirst({
      where: {
        id: membershipId,
        institutionId: session.membership.institutionId,
        status: "INVITED",
        ...(session.membership.role === CampusRole.DEPARTMENT_CHAIR
          ? { role: { not: CampusRole.SUPER_ADMIN } }
          : {}),
      },
      include: {
        user: { select: { email: true } },
        institution: { select: { name: true } },
        invitation: { select: { id: true } },
      },
    });
    if (!membership || !membership.invitation) {
      throw new AuthenticationError("Pending invitation not found.", 404);
    }
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.invitation.update({
      where: { id: membership.invitation.id },
      data: { tokenHash, expiresAt, usedAt: null },
    });
    const url = new URL("/accept-invitation", process.env.APP_URL);
    url.searchParams.set("token", token);
    await sendAccountEmail(
      membership.user.email,
      `You're invited to ${membership.institution.name}`,
      `Welcome to ${membership.institution.name}`,
      `An administrator invited you to join CampusHub as ${membership.role.toLowerCase().replaceAll("_", " ")}. Accept the invitation within seven days.`,
      "Accept invitation",
      url.toString(),
    );
    await recordAudit(session, "identity.membership.invitation_resent", "Membership", membership.id);
    return Response.json({ sent: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(administrativeRoles);
    const { membershipId } = await context.params;
    const membership = await prisma.membership.findFirst({
      where: {
        id: membershipId,
        institutionId: session.membership.institutionId,
        status: "INVITED",
        ...(session.membership.role === CampusRole.DEPARTMENT_CHAIR
          ? { role: { not: CampusRole.SUPER_ADMIN } }
          : {}),
      },
      select: { id: true },
    });
    if (!membership) throw new AuthenticationError("Pending invitation not found.", 404);
    await prisma.membership.update({
      where: { id: membership.id },
      data: { status: "SUSPENDED" },
    });
    await recordAudit(session, "identity.membership.invitation_revoked", "Membership", membership.id);
    return Response.json({ revoked: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
