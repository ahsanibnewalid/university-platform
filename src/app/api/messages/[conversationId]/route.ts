import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { readJsonObject, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requireSession();
    const { conversationId } = await context.params;
    const member = await prisma.conversationMember.findFirst({
      where: {
        conversationId,
        userId: session.userId,
        conversation: { institutionId: session.membership.institutionId },
      },
      select: { conversationId: true },
    });
    if (!member) throw new AuthenticationError("Conversation not found.", 404);
    const messages = await prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      include: {
        sender: { select: { id: true, name: true, imageUrl: true } },
        receipts: { where: { userId: session.userId }, select: { readAt: true } },
        reactions: { select: { userId: true, kind: true } },
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    return Response.json({ messages });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const { conversationId } = await context.params;
    const input = await readJsonObject(request);
    const content = requiredText(input.content, "Message", 1, 10000);
    const member = await prisma.conversationMember.findFirst({
      where: {
        conversationId,
        userId: session.userId,
        conversation: { institutionId: session.membership.institutionId },
      },
      select: { conversationId: true },
    });
    if (!member) throw new AuthenticationError("Conversation not found.", 404);
    const parentId =
      typeof input.parentId === "string" ? input.parentId : undefined;
    if (
      parentId &&
      !(await prisma.message.findFirst({
        where: { id: parentId, conversationId, deletedAt: null },
        select: { id: true },
      }))
    ) {
      throw new AuthenticationError("Thread message was not found.", 404);
    }
    const recipients = await prisma.conversationMember.findMany({
      where: { conversationId, userId: { not: session.userId } },
      select: { userId: true },
    });
    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId: session.userId,
        content,
        parentId,
        receipts: {
          create: [
            { userId: session.userId, readAt: new Date() },
            ...recipients.map(({ userId }) => ({ userId })),
          ],
        },
      },
      include: { sender: { select: { id: true, name: true, imageUrl: true } } },
    });
    return Response.json({ message }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
