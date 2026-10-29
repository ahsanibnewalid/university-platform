import { CampusRole } from "@prisma/client";
import { AuthenticationError, authErrorResponse, assertSameOrigin, requireSession } from "@/lib/auth";
import { administrativeRoles, recordAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ membershipId: string }> };

export async function POST() {
  return Response.json({ error: "Invitation links have been retired. Use college account onboarding." }, { status: 410 });
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(administrativeRoles);
    const { membershipId } = await context.params;
    const membership = await prisma.membership.findFirst({
      where: {
        id: membershipId, institutionId: session.membership.institutionId, status: "INVITED",
        ...(session.membership.role === CampusRole.DEPARTMENT_CHAIR
          ? { role: { not: CampusRole.SUPER_ADMIN } } : {}),
      }, select: { id: true },
    });
    if (!membership) throw new AuthenticationError("Pending account not found.", 404);
    await prisma.membership.update({ where: { id: membership.id }, data: { status: "SUSPENDED" } });
    await recordAudit(session, "identity.membership.approval_revoked", "Membership", membership.id);
    return Response.json({ revoked: true });
  } catch (error) { return authErrorResponse(error); }
}
