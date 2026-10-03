import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { CampusRole, MembershipStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const scryptAsync = promisify(scrypt);
const cookieName = "campushub_session";
const sessionDurationSeconds = 60 * 60 * 24 * 7;

export class AuthenticationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 128) {
    throw new AuthenticationError(
      "Password must contain between 12 and 128 characters.",
      400,
    );
  }
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, key] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "hex");
  if (expected.length !== 64) return false;
  const actual = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(expected, actual);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashLoginIdentifier(email: string) {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

export async function createSession(
  userId: string,
  membershipId: string,
  userAgent: string | null,
) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + sessionDurationSeconds * 1000);
  await prisma.authSession.create({
    data: { userId, membershipId, tokenHash, expiresAt, userAgent },
  });
  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (token) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await prisma.authSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  cookieStore.delete(cookieName);
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const session = await prisma.authSession.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      membership: { status: MembershipStatus.ACTIVE },
    },
    select: {
      id: true,
      userId: true,
      membershipId: true,
      expiresAt: true,
      user: { select: { id: true, name: true, email: true } },
      membership: {
        select: {
          id: true,
          role: true,
          userId: true,
          institutionId: true,
          institution: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });
  if (!session || session.membership.userId !== session.userId) return null;
  return session;
}

export type CurrentSession = NonNullable<
  Awaited<ReturnType<typeof getCurrentSession>>
>;

export async function requireSession(roles?: CampusRole[]) {
  const session = await getCurrentSession();
  if (!session) {
    throw new AuthenticationError("Sign in to continue.", 401);
  }
  if (roles && !roles.includes(session.membership.role)) {
    throw new AuthenticationError(
      "Your active campus role does not permit this action.",
      403,
    );
  }
  return session;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AuthenticationError("Invalid request origin.", 403);
  }
  const requestHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!requestHost || originHost !== requestHost) {
    throw new AuthenticationError("Cross-origin request rejected.", 403);
  }
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthenticationError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("CampusHub request failed:", error);
  return Response.json({ error: "The request could not be completed." }, { status: 500 });
}
