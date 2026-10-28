import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
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

// Native clients hold this opaque session token in the device secure store.
// Only its SHA-256 digest is retained by the server, as with browser sessions.
export async function createMobileSession(
  userId: string,
  membershipId: string,
  userAgent: string | null,
) {
  const token = randomBytes(32).toString("base64url");
  await prisma.authSession.create({
    data: {
      userId,
      membershipId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + sessionDurationSeconds * 1000),
      userAgent: userAgent?.slice(0, 500) ?? null,
    },
  });
  return token;
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
  const requestHeaders = await headers();
  const authorization = requestHeaders.get("authorization");
  const bearer = authorization?.match(/^Bearer ([A-Za-z0-9_-]{40,128})$/);
  // Never fall back to a browser cookie when an invalid Authorization value
  // was explicitly supplied: doing so could silently switch identities.
  if (authorization && !bearer) return null;
  const token = bearer?.[1] ?? (await cookies()).get(cookieName)?.value;
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
  if (!origin) {
    throw new AuthenticationError("A same-origin request origin is required.", 403);
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new AuthenticationError("Invalid request origin.", 403);
  }
  if (parsedOrigin.protocol !== "https:" && parsedOrigin.protocol !== "http:") {
    throw new AuthenticationError("Invalid request origin.", 403);
  }

  const requestHost =
    request.headers.get("x-forwarded-host")?.split(",")[0].trim() ??
    request.headers.get("host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const requestProtocol = forwardedProtocol
    ? `${forwardedProtocol.replace(/:$/, "")}:`
    : new URL(request.url).protocol;
  if (
    !requestHost ||
    parsedOrigin.host.toLowerCase() !== requestHost.toLowerCase() ||
    parsedOrigin.protocol !== requestProtocol
  ) {
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
