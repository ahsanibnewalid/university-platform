import { ApplicationStatus, CampusRole } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { readJsonObject, recordAudit, requiredText, administrativeRoles } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ opportunityId: string }> };
const candidateRoles: CampusRole[] = [CampusRole.STUDENT, CampusRole.MEDICAL_STUDENT, CampusRole.LAW_STUDENT];

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(candidateRoles);
    const { opportunityId } = await context.params;
    const input = await readJsonObject(request);
    const coverLetter =
      typeof input.coverLetter === "string" ? input.coverLetter.trim().slice(0, 8000) : "";
    const opportunity = await prisma.opportunity.findFirst({
      where: {
        id: opportunityId,
        institutionId: session.membership.institutionId,
        OR: [{ closesAt: null }, { closesAt: { gte: new Date() } }],
      },
      select: { id: true, type: true },
    });
    if (!opportunity) throw new AuthenticationError("Opportunity is closed or unavailable.", 404);
    const application = await prisma.jobApplication.upsert({
      where: { opportunityId_studentId: { opportunityId, studentId: session.userId } },
      create: { opportunityId, studentId: session.userId, coverLetter },
      update: { coverLetter, status: ApplicationStatus.SUBMITTED, appliedAt: new Date() },
    });
    await recordAudit(session, "careers.application.submitted", "JobApplication", `${opportunityId}:${session.userId}`);
    return Response.json({ application }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const session = await requireSession([CampusRole.RECRUITER, ...administrativeRoles]);
    const { opportunityId } = await context.params;
    const input = await readJsonObject(request);
    const studentId = requiredText(input.studentId, "Candidate", 1, 100);
    const status =
      typeof input.status === "string" &&
      Object.values(ApplicationStatus).includes(input.status as ApplicationStatus)
        ? (input.status as ApplicationStatus)
        : null;
    if (!status) throw new AuthenticationError("Select a valid application status.", 400);
    const application = await prisma.jobApplication.findFirst({
      where: {
        opportunityId,
        studentId,
        opportunity: {
          institutionId: session.membership.institutionId,
          ...(session.membership.role === CampusRole.RECRUITER
            ? {
                company: {
                  members: { some: { userId: session.userId, active: true } },
                },
              }
            : {}),
        },
      },
      select: { opportunityId: true, studentId: true },
    });
    if (!application) throw new AuthenticationError("Application not found.", 404);
    const updated = await prisma.jobApplication.update({
      where: { opportunityId_studentId: application },
      data: { status },
    });
    await recordAudit(session, "careers.application.reviewed", "JobApplication", `${opportunityId}:${studentId}`);
    await prisma.notification.create({
      data: {
        userId: studentId,
        type: "careers.application.status",
        title: "Application status updated",
        body: `Your application status is now ${status.toLowerCase()}.`,
      },
    });
    return Response.json({ application: updated });
  } catch (error) {
    return authErrorResponse(error);
  }
}
