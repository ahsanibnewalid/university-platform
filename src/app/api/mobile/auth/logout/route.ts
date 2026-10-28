import { authErrorResponse, AuthenticationError, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
      throw new AuthenticationError("A mobile session is required.", 401);
    }
    const session = await requireSession();
    await prisma.authSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return Response.json({ success: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
