import { MembershipStatus } from "@prisma/client";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { administrativeRoles } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// Read-only compatibility for older pending accounts. New account creation is
// handled by the college registrar workflow, never by generic invitations.
export async function GET() {
  try {
    const session = await requireSession(administrativeRoles);
    const memberships = await prisma.membership.findMany({
      where: { institutionId: session.membership.institutionId, status: MembershipStatus.INVITED },
      select: { id: true, role: true, createdAt: true,
        user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" }, take: 100,
    });
    return Response.json({ invitations: memberships });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST() {
  return Response.json({ error: "Invitation signup has been retired. Use college account onboarding." }, { status: 410 });
}
