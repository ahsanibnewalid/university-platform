import { authErrorResponse, assertSameOrigin, requireSession } from "@/lib/auth";
import { administrativeRoles, readJsonObject, recordAudit, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession();
    const services = await prisma.campusService.findMany({
      where: { institutionId: session.membership.institutionId },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      take: 200,
    });
    return Response.json({ services });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(administrativeRoles);
    const input = await readJsonObject(request);
    const name = requiredText(input.name, "Service name", 2, 160);
    const category = requiredText(input.category, "Service category", 2, 80);
    const description = requiredText(input.description, "Service description", 2, 3000);
    const service = await prisma.campusService.create({
      data: {
        institutionId: session.membership.institutionId,
        name,
        category,
        description,
        location: typeof input.location === "string" ? input.location.trim().slice(0, 180) : null,
        hours: typeof input.hours === "string" ? input.hours.trim().slice(0, 180) : null,
        contact: typeof input.contact === "string" ? input.contact.trim().slice(0, 180) : null,
      },
    });
    await recordAudit(session, "campus.service.created", "CampusService", service.id);
    return Response.json({ service }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
