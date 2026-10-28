import {
  assertSameOrigin,
  authErrorResponse,
  createSession,
} from "@/lib/auth";
import { readJsonObject } from "@/lib/api";
import { authenticateCampusCredentials } from "@/lib/password-login";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await readJsonObject(request);
    const { user, membership } = await authenticateCampusCredentials(input, "web");
    await createSession(
      user.id,
      membership.id,
      request.headers.get("user-agent"),
    );
    return Response.json({
      user: { id: user.id, name: user.name },
      institution: membership.institution,
      role: membership.role,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
