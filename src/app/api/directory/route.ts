import { CampusRole, MembershipStatus } from "@prisma/client";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80);
    const members = await prisma.membership.findMany({
      where: {
        institutionId: session.membership.institutionId,
        status: MembershipStatus.ACTIVE,
        userId: { not: session.userId },
        ...(query
          ? {
              user: {
                OR: [
                  { name: { contains: query, mode: "insensitive" } },
                  { email: { contains: query, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      },
      select: {
        user: { select: { id: true, name: true } },
        role: true,
      },
      orderBy: { user: { name: "asc" } },
      take: 50,
    });
    const distinctMembers = new Map<string, { id: string; name: string; roles: Set<CampusRole> }>();
    for (const membership of members) {
      const current = distinctMembers.get(membership.user.id);
      if (current) current.roles.add(membership.role);
      else distinctMembers.set(membership.user.id, {
        id: membership.user.id,
        name: membership.user.name,
        roles: new Set([membership.role]),
      });
    }
    return Response.json({
      members: Array.from(distinctMembers.values(), (member) => ({
        id: member.id,
        name: member.name,
        roles: Array.from(member.roles),
      })),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
