import { CommunityVisibility, PostAudience } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { readJsonObject, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const search = url.searchParams.get("search")?.trim().slice(0, 100);
    const communityId = url.searchParams.get("communityId");
    const posts = await prisma.post.findMany({
      where: {
        institutionId: session.membership.institutionId,
        ...(cursor ? { id: { lt: cursor } } : {}),
        ...(communityId ? { communityId } : {}),
        ...(search ? { content: { contains: search, mode: "insensitive" } } : {}),
        OR: [
          { communityId: null },
          {
            community: {
              visibility: { not: CommunityVisibility.PRIVATE },
            },
          },
          {
            community: {
              members: { some: { userId: session.userId } },
            },
          },
        ],
      },
      include: {
        author: { select: { id: true, name: true, imageUrl: true } },
        community: { select: { id: true, name: true, slug: true } },
        media: { select: { id: true, storageKey: true, contentType: true } },
        poll: {
          include: {
            options: {
              include: { _count: { select: { votes: true } } },
            },
            votes: {
              where: { userId: session.userId },
              select: { optionId: true },
            },
          },
        },
        reactions: {
          where: { userId: session.userId },
          select: { kind: true },
        },
        savedBy: {
          where: { userId: session.userId },
          select: { userId: true },
        },
        _count: { select: { comments: true, reactions: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
    });
    return Response.json({ posts, nextCursor: posts.at(-1)?.id ?? null });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const input = await readJsonObject(request);
    const content = requiredText(input.content, "Post", 1, 5000);
    const communityId =
      typeof input.communityId === "string" ? input.communityId : null;
    if (communityId) {
      const community = await prisma.community.findFirst({
        where: {
          id: communityId,
          institutionId: session.membership.institutionId,
          members: { some: { userId: session.userId } },
        },
        select: { id: true },
      });
      if (!community) {
        throw new AuthenticationError("Join the community before posting there.", 403);
      }
    }
    let poll:
      | { question: string; options: string[]; closesAt: Date | null }
      | undefined;
    if (input.poll !== undefined) {
      if (!input.poll || typeof input.poll !== "object" || Array.isArray(input.poll)) {
        throw new AuthenticationError("Poll details are invalid.", 400);
      }
      const pollInput = input.poll as Record<string, unknown>;
      const question = requiredText(pollInput.question, "Poll question", 2, 240);
      if (
        !Array.isArray(pollInput.options) ||
        pollInput.options.length < 2 ||
        pollInput.options.length > 6
      ) {
        throw new AuthenticationError("Polls need between 2 and 6 options.", 400);
      }
      const options = pollInput.options.map((option) =>
        requiredText(option, "Poll option", 1, 160),
      );
      if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
        throw new AuthenticationError("Poll options must be unique.", 400);
      }
      poll = {
        question,
        options,
        closesAt:
          typeof pollInput.closesAt === "string"
            ? new Date(pollInput.closesAt)
            : null,
      };
      if (poll.closesAt && !Number.isFinite(poll.closesAt.getTime())) {
        throw new AuthenticationError("Poll close time must be a valid date.", 400);
      }
    }
    const audience =
      typeof input.audience === "string" &&
      Object.values(PostAudience).includes(input.audience as PostAudience)
        ? (input.audience as PostAudience)
        : communityId
          ? PostAudience.COMMUNITY
          : PostAudience.INSTITUTION;
    const post = await prisma.post.create({
      data: {
        institutionId: session.membership.institutionId,
        authorId: session.userId,
        content,
        communityId,
        audience,
        poll: poll
          ? {
              create: {
                question: poll.question,
                closesAt: poll.closesAt,
                options: { create: poll.options.map((label) => ({ label })) },
              },
            }
          : undefined,
      },
      include: {
        author: { select: { id: true, name: true, imageUrl: true } },
        community: { select: { id: true, name: true } },
        poll: { include: { options: true } },
      },
    });
    return Response.json({ post }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
