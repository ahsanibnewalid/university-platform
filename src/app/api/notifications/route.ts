import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { readJsonObject, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession();
    const notifications = await prisma.notification.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 60,
    });
    return Response.json({ notifications });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const input = await readJsonObject(request);
    const notificationId =
      typeof input.notificationId === "string"
        ? requiredText(input.notificationId, "Notification", 1, 100)
        : undefined;
    if (notificationId) {
      const result = await prisma.notification.updateMany({
        where: { id: notificationId, userId: session.userId },
        data: { readAt: new Date() },
      });
      if (!result.count) throw new AuthenticationError("Notification not found.", 404);
    } else if (input.all === true) {
      await prisma.notification.updateMany({
        where: { userId: session.userId, readAt: null },
        data: { readAt: new Date() },
      });
    } else {
      throw new AuthenticationError("Select a notification to mark as read.", 400);
    }
    return Response.json({ updated: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
