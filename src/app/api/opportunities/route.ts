import { CampusRole, OpportunityType } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { administrativeRoles, readJsonObject, recordAudit, requiredText, validDate } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession();
    const isRecruiter =
      session.membership.role === CampusRole.RECRUITER ||
      administrativeRoles.includes(session.membership.role);
    const opportunities = await prisma.opportunity.findMany({
      where: {
        institutionId: session.membership.institutionId,
        OR: [{ closesAt: null }, { closesAt: { gte: new Date() } }],
      },
      include: {
        company: { select: { id: true, name: true, verifiedAt: true } },
        _count: { select: { applications: true } },
        ...(isRecruiter
          ? {
              applications: {
                include: { student: { select: { id: true, name: true, email: true } } },
              },
            }
          : {
              applications: {
                where: { studentId: session.userId },
                select: { status: true, appliedAt: true },
              },
            }),
      },
      orderBy: [{ closesAt: "asc" }, { createdAt: "desc" }],
      take: 100,
    });
    return Response.json({ opportunities });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession([
      CampusRole.RECRUITER,
      ...administrativeRoles,
    ]);
    const input = await readJsonObject(request);
    const title = requiredText(input.title, "Opportunity title", 3, 180);
    const description = requiredText(input.description, "Opportunity description", 5, 12000);
    const location =
      typeof input.location === "string" ? input.location.trim().slice(0, 180) : null;
    const type =
      typeof input.type === "string" &&
      Object.values(OpportunityType).includes(input.type as OpportunityType)
        ? (input.type as OpportunityType)
        : OpportunityType.INTERNSHIP;
    const companyId = requiredText(input.companyId, "Company", 1, 100);
    const company = await prisma.company.findFirst({
      where: {
        id: companyId,
        institutionId: session.membership.institutionId,
        ...(session.membership.role === CampusRole.RECRUITER
          ? { members: { some: { userId: session.userId, active: true } } }
          : {}),
      },
      select: { id: true },
    });
    if (!company) {
      throw new AuthenticationError("Company not found or you are not authorized to represent it.", 404);
    }
    const closesAt =
      typeof input.closesAt === "string" && input.closesAt
        ? validDate(input.closesAt, "Closing date")
        : null;
    const opportunity = await prisma.opportunity.create({
      data: {
        institutionId: session.membership.institutionId,
        companyId,
        title,
        description,
        location,
        type,
        closesAt,
      },
    });
    await recordAudit(session, "careers.opportunity.created", "Opportunity", opportunity.id);
    return Response.json({ opportunity }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
