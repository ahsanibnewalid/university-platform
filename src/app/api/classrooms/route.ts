import { AuthenticationError, authErrorResponse, assertSameOrigin, requireSession } from "@/lib/auth";
import { administrativeRoles, isPrismaUniqueError, readJsonObject, recordAudit, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession();
    const classrooms = await prisma.classroom.findMany({
      where: { institutionId: session.membership.institutionId },
      orderBy: [{ building: "asc" }, { code: "asc" }],
      take: 200,
    });
    return Response.json({ classrooms });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(administrativeRoles);
    const input = await readJsonObject(request);
    const code = requiredText(input.code, "Classroom code", 1, 32).toUpperCase();
    const name = requiredText(input.name, "Classroom name", 2, 120);
    const capacity =
      input.capacity === undefined || input.capacity === null || input.capacity === ""
        ? undefined
        : typeof input.capacity === "number" &&
            Number.isInteger(input.capacity) &&
            input.capacity > 0 &&
            input.capacity <= 100000
          ? input.capacity
          : null;
    if (capacity === null) {
      throw new AuthenticationError("Capacity must be a positive whole number.", 400);
    }
    const building =
      typeof input.building === "string" && input.building.trim()
        ? requiredText(input.building, "Building", 1, 100)
        : undefined;
    const classroom = await prisma.classroom.create({
      data: {
        institutionId: session.membership.institutionId,
        code,
        name,
        capacity,
        building,
      },
    });
    await recordAudit(session, "academic.classroom.created", "Classroom", classroom.id);
    return Response.json({ classroom }, { status: 201 });
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return Response.json({ error: "A classroom with that code already exists." }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}
