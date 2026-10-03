import { CampusRole, SupportTicketStatus } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { readJsonObject, recordAudit, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const supportRoles: CampusRole[] = [
  CampusRole.PRINCIPAL,
  CampusRole.UNIVERSITY_ADMIN,
  CampusRole.SUPER_ADMIN,
];

export async function GET() {
  try {
    const session = await requireSession();
    const isSupport = supportRoles.includes(session.membership.role);
    const tickets = await prisma.supportTicket.findMany({
      where: {
        institutionId: session.membership.institutionId,
        ...(isSupport ? {} : { requesterId: session.userId }),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return Response.json({ tickets });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const input = await readJsonObject(request);
    const subject = requiredText(input.subject, "Request subject", 3, 180);
    const description = requiredText(input.description, "Request details", 5, 10000);
    const ticket = await prisma.supportTicket.create({
      data: {
        institutionId: session.membership.institutionId,
        requesterId: session.userId,
        subject,
        description,
      },
    });
    await recordAudit(session, "support.ticket.created", "SupportTicket", ticket.id);
    return Response.json({ ticket }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(supportRoles);
    const input = await readJsonObject(request);
    const ticketId = requiredText(input.ticketId, "Support ticket", 1, 100);
    const status =
      typeof input.status === "string" &&
      Object.values(SupportTicketStatus).includes(input.status as SupportTicketStatus)
        ? (input.status as SupportTicketStatus)
        : null;
    if (!status) throw new AuthenticationError("Choose a valid support ticket status.", 400);
    const result = await prisma.supportTicket.updateMany({
      where: { id: ticketId, institutionId: session.membership.institutionId },
      data: { status },
    });
    if (!result.count) throw new AuthenticationError("Support ticket not found.", 404);
    await recordAudit(session, "support.ticket.updated", "SupportTicket", ticketId);
    return Response.json({ updated: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
