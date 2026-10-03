import { CampusRole, MembershipStatus } from "@prisma/client";
import {
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { administrativeRoles, readJsonObject, recordAudit, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession();
    const projects = await prisma.researchProject.findMany({
      where: {
        institutionId: session.membership.institutionId,
        OR: [
          { leadId: session.userId },
          { members: { some: { userId: session.userId } } },
          { institution: { memberships: { some: { userId: session.userId, status: MembershipStatus.ACTIVE, role: { in: administrativeRoles } } } } },
        ],
      },
      include: {
        lead: { select: { id: true, name: true } },
        members: { include: { user: { select: { id: true, name: true } } } },
        partners: { select: { partnerName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return Response.json({ projects });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession([
      CampusRole.FACULTY,
      CampusRole.DEPARTMENT_CHAIR,
      CampusRole.PRINCIPAL,
      CampusRole.UNIVERSITY_ADMIN,
      CampusRole.SUPER_ADMIN,
    ]);
    const input = await readJsonObject(request);
    const title = requiredText(input.title, "Research project title", 3, 180);
    const abstract = requiredText(input.abstract, "Project summary", 10, 10000);
    const partnerName =
      typeof input.partnerName === "string" ? input.partnerName.trim().slice(0, 180) : "";
    const project = await prisma.researchProject.create({
      data: {
        institutionId: session.membership.institutionId,
        leadId: session.userId,
        title,
        abstract,
      },
    });
    if (partnerName) {
      await prisma.researchProjectPartner.create({
        data: {
          projectId: project.id,
          institutionId: session.membership.institutionId,
          partnerName,
        },
      });
    }
    await recordAudit(session, "research.project.created", "ResearchProject", project.id);
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
