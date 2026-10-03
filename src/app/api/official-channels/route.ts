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
    const channels = await prisma.officialChannel.findMany({
      where: { institutionId: session.membership.institutionId },
      include: { _count: { select: { messages: true } } },
      orderBy: { name: "asc" },
    });
    return Response.json({ channels });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(administrativeRoles);
    const input = await readJsonObject(request);
    const name = requiredText(input.name, "Channel name", 2, 100);
    const retentionDays =
      typeof input.retentionDays === "number" &&
      Number.isInteger(input.retentionDays) &&
      input.retentionDays >= 1 &&
      input.retentionDays <= 3650
        ? input.retentionDays
        : null;
    const channel = await prisma.officialChannel.create({
      data: {
        institutionId: session.membership.institutionId,
        name,
        retentionDays,
      },
    });
    await recordAudit(session, "communication.official_channel.created", "OfficialChannel", channel.id);
    return Response.json({ channel }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const input = await readJsonObject(request);
    const channelId = requiredText(input.channelId, "Official channel", 1, 100);
    const channel = await prisma.officialChannel.findFirst({
      where: { id: channelId, institutionId: session.membership.institutionId },
      select: { id: true },
    });
    if (!channel) return Response.json({ error: "Official channel not found." }, { status: 404 });
    const content = requiredText(input.content, "Official message", 1, 10000);
    const message = await prisma.officialMessage.create({
      data: { channelId, authorId: session.userId, content },
    });
    await recordAudit(session, "communication.official_message.sent", "OfficialMessage", message.id);
    return Response.json({ message }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
