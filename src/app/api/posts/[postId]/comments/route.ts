import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { readJsonObject, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ postId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requireSession();
    const { postId } = await context.params;
    const post = await prisma.post.findFirst({
      where: { id: postId, institutionId: session.membership.institutionId },
      select: { id: true },
    });
    if (!post) throw new AuthenticationError("Post not found.", 404);
    const comments = await prisma.comment.findMany({
      where: { postId },
      include: { author: { select: { id: true, name: true, imageUrl: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    return Response.json({ comments });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const { postId } = await context.params;
    const input = await readJsonObject(request);
    const content = requiredText(input.content, "Comment", 1, 2000);
    const post = await prisma.post.findFirst({
      where: { id: postId, institutionId: session.membership.institutionId },
      select: { id: true },
    });
    if (!post) throw new AuthenticationError("Post not found.", 404);
    const comment = await prisma.comment.create({
      data: { postId, authorId: session.userId, content },
      include: { author: { select: { id: true, name: true, imageUrl: true } } },
    });
    return Response.json({ comment }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
