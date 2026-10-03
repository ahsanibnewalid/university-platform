import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import {
  recordAudit,
  readJsonObject,
  requiredText,
  teachingRoles,
  validDate,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession();
    const events = await prisma.event.findMany({
      where: { institutionId: session.membership.institutionId, startsAt: { gte: new Date(Date.now() - 86400000) } },
      include: {
        creator: { select: { id: true, name: true } },
        _count: { select: { rsvps: true } },
        rsvps: {
          where: { userId: session.userId },
          select: { userId: true },
        },
      },
      orderBy: { startsAt: "asc" },
      take: 100,
    });
    return Response.json({ events });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(teachingRoles);
    const input = await readJsonObject(request);
    const title = requiredText(input.title, "Event title", 2, 180);
    const description = requiredText(input.description, "Event details", 2, 10000);
    const location = requiredText(input.location, "Location", 2, 240);
    const startsAt = validDate(input.startsAt, "Start time");
    const endsAt =
      typeof input.endsAt === "string" && input.endsAt
        ? validDate(input.endsAt, "End time")
        : null;
    if (endsAt && endsAt <= startsAt) {
      throw new AuthenticationError("End time must be after the start time.", 400);
    }
    const event = await prisma.event.create({
      data: {
        institutionId: session.membership.institutionId,
        creatorId: session.userId,
        title,
        description,
        location,
        startsAt,
        endsAt,
      },
    });
    await recordAudit(session, "campus.event.created", "Event", event.id);
    return Response.json({ event }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const input = await readJsonObject(request);
    const eventId = requiredText(input.eventId, "Event", 1, 100);
    const event = await prisma.event.findFirst({
      where: { id: eventId, institutionId: session.membership.institutionId },
      select: { id: true },
    });
    if (!event) throw new AuthenticationError("Campus event not found.", 404);
    const alreadyGoing = await prisma.eventRsvp.findUnique({
      where: { eventId_userId: { eventId, userId: session.userId } },
    });
    if (alreadyGoing) {
      await prisma.eventRsvp.delete({ where: { eventId_userId: { eventId, userId: session.userId } } });
      return Response.json({ going: false });
    }
    await prisma.eventRsvp.create({ data: { eventId, userId: session.userId } });
    await recordAudit(session, "campus.event.rsvp", "Event", eventId);
    return Response.json({ going: true }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationError) return authErrorResponse(error);
    return authErrorResponse(error);
  }
}
