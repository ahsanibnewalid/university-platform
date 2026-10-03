import { CampusRole } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { administrativeRoles, readJsonObject, recordAudit, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession();
    const companies = await prisma.company.findMany({
      where: {
        institutionId: session.membership.institutionId,
        ...(session.membership.role === CampusRole.RECRUITER
          ? { members: { some: { userId: session.userId, active: true } } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        website: true,
        description: true,
        verifiedAt: true,
        ...(administrativeRoles.includes(session.membership.role)
          ? { _count: { select: { members: true, opportunities: true } } }
          : {}),
      },
      orderBy: { name: "asc" },
      take: 100,
    });
    return Response.json({ companies });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession([CampusRole.RECRUITER, ...administrativeRoles]);
    const input = await readJsonObject(request);
    const name = requiredText(input.name, "Company name", 2, 160);
    const website =
      typeof input.website === "string" && input.website
        ? input.website.trim().slice(0, 500)
        : null;
    if (website) {
      let parsed: URL;
      try {
        parsed = new URL(website);
      } catch {
        throw new AuthenticationError("Enter a valid company website URL.", 400);
      }
      if (!["https:", "http:"].includes(parsed.protocol)) {
        throw new AuthenticationError("Company website must use HTTP or HTTPS.", 400);
      }
    }
    const description =
      typeof input.description === "string" ? input.description.trim().slice(0, 3000) : "";
    const company = await prisma.company.create({
      data: {
        institutionId: session.membership.institutionId,
        name,
        website,
        description,
        members:
          session.membership.role === CampusRole.RECRUITER
            ? { create: { userId: session.userId } }
            : undefined,
      },
    });
    await recordAudit(session, "careers.company.created", "Company", company.id);
    return Response.json({ company }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
