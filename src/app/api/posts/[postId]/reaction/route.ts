import { ReactionKind } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { readJsonObject } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ postId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const { postId } = await context.params;
    const post = await prisma.post.findFirst({
      where: { id: postId, institutionId: session.membership.institutionId },
      select: { id: true },
    });
    if (!post) throw new AuthenticationError("Post not found.", 404);
    const input = await readJsonObject(request);
    const requestedKind =
      typeof input.kind === "string" &&
      Object.values(ReactionKind).includes(input.kind as ReactionKind)
        ? (input.kind as ReactionKind)
        : ReactionKind.LIKE;
    const existing = await prisma.reaction.findUnique({
      where: { postId_userId: { postId, userId: session.userId } },
    });
    if (existing?.kind === requestedKind) {
      await prisma.reaction.delete({ where: { postId_userId: { postId, userId: session.userId } } });
      return Response.json({ reacted: false });
    }
    const reaction = await prisma.reaction.upsert({
      where: { postId_userId: { postId, userId: session.userId } },
      create: { postId, userId: session.userId, kind: requestedKind },
      update: { kind: requestedKind },
    });
    return Response.json({ reacted: true, reaction }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
