import { CampusRole } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import {
  readJsonObject,
  recordAudit,
  requiredText,
  administrativeRoles,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

const validRoles = new Set(Object.values(CampusRole));

export async function GET() {
  try {
    const session = await requireSession();
    const privileged = ([
      CampusRole.DEPARTMENT_CHAIR,
      CampusRole.PRINCIPAL,
      CampusRole.UNIVERSITY_ADMIN,
      CampusRole.SUPER_ADMIN,
    ] as CampusRole[]).includes(session.membership.role);
    const announcements = await prisma.announcement.findMany({
      where: {
        institutionId: session.membership.institutionId,
        ...(privileged
          ? {}
          : {
              publishedAt: { lte: new Date() },
              OR: [
                { audienceRoles: { isEmpty: true } },
                { audienceRoles: { has: session.membership.role } },
              ],
            }),
      },
      include: { author: { select: { id: true, name: true } } },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 100,
    });
    return Response.json({ announcements });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(administrativeRoles);
    const input = await readJsonObject(request);
    const title = requiredText(input.title, "Announcement title", 2, 180);
    const body = requiredText(input.body, "Announcement", 2, 10000);
    const audienceRoles = Array.isArray(input.audienceRoles)
      ? input.audienceRoles.filter(
          (role): role is CampusRole =>
            typeof role === "string" && validRoles.has(role as CampusRole),
        )
      : [];
    if (Array.isArray(input.audienceRoles) && audienceRoles.length !== input.audienceRoles.length) {
      throw new AuthenticationError("Select valid campus roles for the audience.", 400);
    }
    const publish = input.publish !== false;
    const announcement = await prisma.announcement.create({
      data: {
        institutionId: session.membership.institutionId,
        authorId: session.userId,
        title,
        body,
        audienceRoles,
        publishedAt: publish ? new Date() : null,
      },
    });
    await recordAudit(
      session,
      publish ? "communication.announcement.published" : "communication.announcement.drafted",
      "Announcement",
      announcement.id,
    );
    return Response.json({ announcement }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
