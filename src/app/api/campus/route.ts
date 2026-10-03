import { authErrorResponse, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession();
    const institutionId = session.membership.institutionId;
    const [services, lostAndFound, events, transitRoutes, libraryCatalog, hostelBuildings, cafeteriaMenu] =
      await Promise.all([
        prisma.campusService.findMany({
          where: { institutionId },
          orderBy: [{ category: "asc" }, { name: "asc" }],
          take: 100,
        }),
        prisma.lostFoundPost.findMany({
          where: { institutionId, status: "OPEN" },
          include: { author: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        prisma.event.findMany({
          where: { institutionId, startsAt: { gte: new Date() } },
          include: { _count: { select: { rsvps: true } } },
          orderBy: { startsAt: "asc" },
          take: 20,
        }),
        prisma.transitRoute.findMany({
          where: { institutionId },
          include: { stops: { orderBy: { sequence: "asc" } } },
          orderBy: { name: "asc" },
        }),
        prisma.libraryItem.findMany({
          where: { institutionId },
          orderBy: { title: "asc" },
          take: 100,
        }),
        prisma.hostelBuilding.findMany({
          where: { institutionId },
          include: { _count: { select: { rooms: true } } },
          orderBy: { name: "asc" },
        }),
        prisma.cafeteriaMenuItem.findMany({
          where: { institutionId, availableOn: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
          orderBy: [{ venue: "asc" }, { availableOn: "asc" }],
          take: 80,
        }),
      ]);
    return Response.json({
      services,
      lostAndFound,
      events,
      transitRoutes,
      libraryCatalog,
      hostelBuildings,
      cafeteriaMenu,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
