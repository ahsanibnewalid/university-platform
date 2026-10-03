import { assertSameOrigin, authErrorResponse, clearSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await clearSession();
    return Response.json({ success: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
