import { LostFoundStatus } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { readJsonObject, recordAudit, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession();
    const posts = await prisma.lostFoundPost.findMany({
      where: { institutionId: session.membership.institutionId },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return Response.json({ posts });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const input = await readJsonObject(request);
    const title = requiredText(input.title, "Lost or found item", 2, 160);
    const description = requiredText(input.description, "Description", 3, 3000);
    if (typeof input.isLost !== "boolean") {
      throw new AuthenticationError("Choose whether this item was lost or found.", 400);
    }
    const location =
      typeof input.location === "string" ? input.location.trim().slice(0, 180) : null;
    const post = await prisma.lostFoundPost.create({
      data: {
        institutionId: session.membership.institutionId,
        authorId: session.userId,
        title,
        description,
        isLost: input.isLost,
        location,
      },
    });
    await recordAudit(session, "campus.lost_found.created", "LostFoundPost", post.id);
    return Response.json({ post }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const input = await readJsonObject(request);
    const postId = requiredText(input.postId, "Lost-and-found item", 1, 100);
    const post = await prisma.lostFoundPost.findFirst({
      where: { id: postId, institutionId: session.membership.institutionId },
      select: { id: true, authorId: true },
    });
    if (!post) throw new AuthenticationError("Item not found.", 404);
    const admin = [
      "DEPARTMENT_CHAIR",
      "PRINCIPAL",
      "UNIVERSITY_ADMIN",
      "SUPER_ADMIN",
    ].includes(session.membership.role);
    if (!admin && post.authorId !== session.userId) {
      throw new AuthenticationError("Only the post author or a campus administrator can resolve this item.", 403);
    }
    const status =
      input.status === LostFoundStatus.OPEN ||
      input.status === LostFoundStatus.CLAIMED ||
      input.status === LostFoundStatus.RESOLVED
        ? input.status
        : null;
    if (!status) throw new AuthenticationError("Select a valid item status.", 400);
    const updated = await prisma.lostFoundPost.update({
      where: { id: postId },
      data: { status },
    });
    await recordAudit(session, "campus.lost_found.updated", "LostFoundPost", postId);
    return Response.json({ post: updated });
  } catch (error) {
    return authErrorResponse(error);
  }
}
