import { authErrorResponse, createMobileSession } from "@/lib/auth";
import { readJsonObject } from "@/lib/api";
import { authenticateCampusCredentials } from "@/lib/password-login";

// Native clients use TLS and opaque bearer sessions, rather than web cookies.
export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return Response.json({ error: "Content-Type must be application/json." }, { status: 415 });
    }
    const input = await readJsonObject(request);
    const { user, membership, needsStudentEmail } = await authenticateCampusCredentials(input, "mobile");
    const token = await createMobileSession(user.id, membership.id, request.headers.get("user-agent"));
    return Response.json({
      token,
      user: { id: user.id, name: user.name },
      institution: { id: membership.institution.id, name: membership.institution.name, slug: membership.institution.slug },
      role: membership.role,
      needsStudentEmail,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
