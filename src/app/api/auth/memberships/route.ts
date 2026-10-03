import { authErrorResponse, getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) return Response.json({ memberships: [] }, { status: 401 });
    const memberships = await prisma.membership.findMany({
      where: { userId: session.userId, status: "ACTIVE" },
      select: {
        id: true,
        role: true,
        institution: { select: { id: true, name: true, slug: true } },
      },
      orderBy: [{ institution: { name: "asc" } }, { role: "asc" }],
    });
    return Response.json({ memberships });
  } catch (error) {
    return authErrorResponse(error);
  }
}
