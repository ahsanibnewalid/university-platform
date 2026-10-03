import { CampusRole, MembershipStatus, Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import {
  administrativeRoles,
  readJsonObject,
  recordAudit,
  requiredText,
} from "@/lib/api";
import { sendAccountEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

const inviteableRoles = Object.values(CampusRole);

export async function GET() {
  try {
    const session = await requireSession(administrativeRoles);
    const memberships = await prisma.membership.findMany({
      where: {
        institutionId: session.membership.institutionId,
        status: MembershipStatus.INVITED,
      },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
        invitation: { select: { expiresAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return Response.json({ invitations: memberships });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(administrativeRoles);
    const input = await readJsonObject(request);
    const name = requiredText(input.name, "Name", 2, 120);
    const email = requiredText(input.email, "Email", 5, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AuthenticationError("Enter a valid email address.", 400);
    }
    const role =
      typeof input.role === "string" &&
      inviteableRoles.includes(input.role as CampusRole)
        ? (input.role as CampusRole)
        : null;
    if (!role) throw new AuthenticationError("Select a valid campus role.", 400);
    if (
      role === CampusRole.SUPER_ADMIN &&
      session.membership.role !== CampusRole.SUPER_ADMIN
    ) {
      throw new AuthenticationError("Only a super-admin may invite another super-admin.", 403);
    }
    const institutionId = session.membership.institutionId;
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true },
    });
    const userId = existingUser?.id ?? randomBytes(16).toString("hex");
    const accountToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(accountToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const created = await prisma.$transaction(async (tx) => {
      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: { name: existingUser.name || name },
          })
        : await tx.user.create({
            data: { id: userId, name, email },
          });
      const membership = await tx.membership.create({
        data: { userId: user.id, institutionId, role, status: MembershipStatus.INVITED },
      });
      const invitation = await tx.invitation.create({
        data: { userId: user.id, membershipId: membership.id, tokenHash, expiresAt },
      });
      return { user, membership, invitation };
    });
    const setupUrl = `${process.env.APP_URL}/accept-invitation?token=${encodeURIComponent(accountToken)}`;
    await sendAccountEmail(
      email,
      `You're invited to ${session.membership.institution.name}`,
      `Welcome to ${session.membership.institution.name}`,
      `An administrator invited you to join CampusHub as ${role.toLowerCase().replaceAll("_", " ")}. Accept the invitation within seven days.`,
      "Accept invitation",
      setupUrl,
    );
    await recordAudit(session, "identity.membership.invited", "Membership", created.membership.id);
    return Response.json(
      {
        invitation: {
          membershipId: created.membership.id,
          email: created.user.email,
          role: created.membership.role,
          expiresAt: created.invitation.expiresAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "This account already has that campus role or invitation." },
        { status: 409 },
      );
    }
    return authErrorResponse(error);
  }
}
