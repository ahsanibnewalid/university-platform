import { CampusRole } from "@prisma/client";
import { authErrorResponse, AuthenticationError, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const auditReviewRoles = [
  CampusRole.SUPER_ADMIN, CampusRole.PRINCIPAL, CampusRole.REGISTRAR, CampusRole.UNIVERSITY_ADMIN,
];

export async function GET(request: Request) {
  try {
    const session = await requireSession(auditReviewRoles);
    const query = new URL(request.url).searchParams;
    const action = query.get("action")?.trim() ?? "";
    const before = query.get("before")?.trim() ?? "";
    if (action.length > 100 || (before && !Number.isFinite(Date.parse(before)))) {
      throw new AuthenticationError("Invalid audit filters.", 400);
    }
    const events = await prisma.auditEvent.findMany({
      where: {
        institutionId: session.membership.institutionId,
        ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      select: {
        id: true, actorId: true, action: true, entityType: true, entityId: true, createdAt: true,
        actor: { select: { name: true } },
        // Deliberately omit metadata; some event payloads contain student and finance identifiers.
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    await prisma.auditEvent.create({
      data: {
        institutionId: session.membership.institutionId,
        actorId: session.userId,
        action: "security.audit.reviewed",
        entityType: "AuditEvent",
        metadata: { count: events.length, filtered: Boolean(action || before) },
      },
    });
    return Response.json({ events, nextBefore: events.length === 100 ? events.at(-1)?.createdAt : null }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
