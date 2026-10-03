import { CampusRole, ConversationKind, MembershipStatus } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { readJsonObject, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const studentRoles = [
  CampusRole.STUDENT,
  CampusRole.MEDICAL_STUDENT,
  CampusRole.LAW_STUDENT,
];

export async function GET() {
  try {
    const session = await requireSession();
    const conversations = await prisma.conversation.findMany({
      where: {
        institutionId: session.membership.institutionId,
        members: { some: { userId: session.userId, archivedAt: null } },
      },
      include: {
        members: {
          select: {
            userId: true,
            user: { select: { id: true, name: true, imageUrl: true } },
          },
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { sender: { select: { id: true, name: true } } },
        },
        _count: {
          select: {
            messages: {
              where: {
                receipts: {
                  some: { userId: session.userId, readAt: null },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return Response.json({ conversations });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const input = await readJsonObject(request);
    const otherMembers = Array.isArray(input.memberIds)
      ? [...new Set(input.memberIds.filter((id): id is string => typeof id === "string"))]
      : [];
    if (
      otherMembers.length === 0 ||
      otherMembers.length > 19 ||
      otherMembers.includes(session.userId)
    ) {
      throw new AuthenticationError("Choose between 1 and 19 other campus members.", 400);
    }
    const requestedKind =
      typeof input.kind === "string" &&
      Object.values(ConversationKind).includes(input.kind as ConversationKind)
        ? (input.kind as ConversationKind)
        : otherMembers.length === 1
          ? ConversationKind.DIRECT
          : ConversationKind.GROUP;
    if (
      requestedKind === ConversationKind.DIRECT &&
      otherMembers.length !== 1
    ) {
      throw new AuthenticationError("A direct message must have one recipient.", 400);
    }
    const courseSectionId =
      typeof input.courseSectionId === "string" ? input.courseSectionId : null;
    if (
      (requestedKind === ConversationKind.COURSE) !== Boolean(courseSectionId)
    ) {
      throw new AuthenticationError(
        "Course discussions must be linked to an enrolled course section.",
        400,
      );
    }
    const memberships = await prisma.membership.findMany({
      where: {
        userId: { in: otherMembers },
        institutionId: session.membership.institutionId,
        status: MembershipStatus.ACTIVE,
      },
      select: { userId: true },
    });
    if (memberships.length !== otherMembers.length) {
      throw new AuthenticationError("Every participant must be an active campus member.", 404);
    }
    if (requestedKind === ConversationKind.COURSE) {
      const section = await prisma.courseSection.findFirst({
        where: {
          id: courseSectionId!,
          term: { institutionId: session.membership.institutionId },
          OR: [
            { instructors: { some: { userId: session.userId } } },
            { enrollments: { some: { studentId: session.userId } } },
          ],
        },
        select: { id: true },
      });
      const participants = await prisma.enrollment.findMany({
        where: {
          sectionId: courseSectionId!,
          status: "ENROLLED",
          studentId: { in: otherMembers },
        },
        select: { studentId: true },
      });
      const instructors = await prisma.courseInstructor.findMany({
        where: { sectionId: courseSectionId!, userId: { in: otherMembers } },
        select: { userId: true },
      });
      const allowed = new Set([
        ...participants.map((participant) => participant.studentId),
        ...instructors.map((instructor) => instructor.userId),
      ]);
      if (!section || otherMembers.some((memberId) => !allowed.has(memberId))) {
        throw new AuthenticationError(
          "Course discussions are limited to the section's instructor and enrolled students.",
          403,
        );
      }
    }
    if (requestedKind === ConversationKind.SUPPORT) {
      const supportAgents = await prisma.membership.count({
        where: {
          userId: { in: otherMembers },
          institutionId: session.membership.institutionId,
          status: "ACTIVE",
          role: { in: [CampusRole.UNIVERSITY_ADMIN, CampusRole.SUPER_ADMIN] },
        },
      });
      if (!supportAgents) {
        throw new AuthenticationError("Include an active campus support administrator.", 400);
      }
    }
    const title =
      requestedKind === ConversationKind.GROUP
        ? requiredText(input.title, "Group name", 2, 100)
        : null;
    const conversation = await prisma.conversation.create({
      data: {
        institutionId: session.membership.institutionId,
        kind: requestedKind,
        title,
        courseSectionId,
        members: {
          create: [session.userId, ...otherMembers].map((userId) => ({ userId })),
        },
      },
      include: {
        members: { select: { user: { select: { id: true, name: true } } } },
      },
    });
    return Response.json({ conversation }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const input = await readJsonObject(request);
    const conversationId = requiredText(input.conversationId, "Conversation", 1, 100);
    const conversationMember = await prisma.conversationMember.findFirst({
      where: {
        conversationId,
        userId: session.userId,
        conversation: { institutionId: session.membership.institutionId },
      },
      select: { conversationId: true },
    });
    if (!conversationMember) {
      throw new AuthenticationError("Conversation not found.", 404);
    }
    const messageIds = Array.isArray(input.messageIds)
      ? [...new Set(input.messageIds.filter((id): id is string => typeof id === "string"))].slice(0, 100)
      : [];
    if (messageIds.length) {
      await prisma.messageReceipt.updateMany({
        where: {
          userId: session.userId,
          messageId: { in: messageIds },
          message: { conversationId },
        },
        data: { readAt: new Date() },
      });
    }
    if (input.archived === true || input.archived === false) {
      await prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId: session.userId } },
        data: { archivedAt: input.archived ? new Date() : null },
      });
    }
    if (input.muteUntil === null || typeof input.muteUntil === "string") {
      const mutedUntil =
        typeof input.muteUntil === "string" &&
        Number.isFinite(Date.parse(input.muteUntil))
          ? new Date(input.muteUntil)
          : null;
      await prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId: session.userId } },
        data: { mutedUntil },
      });
    }
    return Response.json({ updated: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(studentRoles);
    const input = await readJsonObject(request);
    const conversationId = requiredText(input.conversationId, "Conversation", 1, 100);
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        institutionId: session.membership.institutionId,
        kind: ConversationKind.COURSE,
        members: { some: { userId: session.userId } },
      },
      select: { id: true },
    });
    if (!conversation) throw new AuthenticationError("Course discussion not found.", 404);
    const content = requiredText(input.content, "Message", 1, 10000);
    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId: session.userId,
        content,
        receipts: {
          create: {
            userId: session.userId,
            readAt: new Date(),
          },
        },
      },
      include: { sender: { select: { id: true, name: true } } },
    });
    return Response.json({ message }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
