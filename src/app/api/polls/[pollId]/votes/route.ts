import { AuthenticationError, authErrorResponse, assertSameOrigin, requireSession } from "@/lib/auth";
import { readJsonObject, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ pollId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const { pollId } = await context.params;
    const input = await readJsonObject(request);
    const optionId = requiredText(input.optionId, "Poll option", 1, 100);
    const poll = await prisma.poll.findFirst({
      where: {
        id: pollId,
        closesAt: { gt: new Date() },
        post: { institutionId: session.membership.institutionId },
        options: { some: { id: optionId } },
      },
      select: { id: true },
    });
    if (!poll) throw new AuthenticationError("Poll is closed or the option is invalid.", 404);
    const vote = await prisma.pollVote.upsert({
      where: { pollId_userId: { pollId, userId: session.userId } },
      create: { pollId, optionId, userId: session.userId },
      update: { optionId, createdAt: new Date() },
    });
    return Response.json({ vote }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
