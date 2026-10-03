import { CampusRole, MembershipStatus, Prisma } from "@prisma/client";
import { timingSafeEqual } from "node:crypto";
import {
  assertSameOrigin,
  authErrorResponse,
  AuthenticationError,
  createSession,
  hashPassword,
  normalizeEmail,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const setupAvailable = (await prisma.institution.count()) === 0;
    return Response.json({
      setupAvailable,
      bootstrapConfigured: Boolean(
        process.env.BOOTSTRAP_SECRET &&
          process.env.BOOTSTRAP_SECRET.length >= 24,
      ),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

function isValidBootstrapSecret(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

function normalizeInstitutionSlug(value: string) {
  const candidate = value.trim().toLowerCase();
  let slug = candidate;

  if (candidate.includes(".") || candidate.startsWith("http://") || candidate.startsWith("https://")) {
    let website: URL;
    try {
      website = new URL(
        candidate.startsWith("http://") || candidate.startsWith("https://")
          ? candidate
          : `https://${candidate}`,
      );
    } catch {
      throw new AuthenticationError(
        "Enter a valid institution slug or website URL.",
        400,
      );
    }
    if (website.protocol !== "http:" && website.protocol !== "https:") {
      throw new AuthenticationError(
        "Institution website URLs must use HTTP or HTTPS.",
        400,
      );
    }
    slug = website.hostname.replace(/^www\./, "").replaceAll(".", "-");
  }

  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) {
    throw new AuthenticationError(
      "Use a slug with 1–63 lowercase letters, numbers, or hyphens, or enter a valid website URL.",
      400,
    );
  }

  return slug;
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const expectedSecret = process.env.BOOTSTRAP_SECRET;
    if (!expectedSecret || expectedSecret.length < 24) {
      throw new AuthenticationError(
        "Bootstrap is disabled until a sufficiently strong BOOTSTRAP_SECRET is configured.",
        503,
      );
    }
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      throw new AuthenticationError("Invalid request body.", 400);
    }
    const input = body as Record<string, unknown>;
    const { bootstrapSecret, institutionName, institutionSlug, name, email, password } =
      input;
    if (
      typeof bootstrapSecret !== "string" ||
      !isValidBootstrapSecret(bootstrapSecret, expectedSecret)
    ) {
      throw new AuthenticationError("Invalid bootstrap credentials.", 403);
    }
    if (
      typeof institutionName !== "string" ||
      institutionName.trim().length < 2 ||
      institutionName.trim().length > 120
    ) {
      throw new AuthenticationError(
        "Institution name must be between 2 and 120 characters.",
        400,
      );
    }
    if (typeof institutionSlug !== "string" || institutionSlug.trim().length === 0) {
      throw new AuthenticationError(
        "Enter an institution URL slug or website URL.",
        400,
      );
    }
    const normalizedSlug = normalizeInstitutionSlug(institutionSlug);
    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 120
    ) {
      throw new AuthenticationError(
        "Your name must be between 2 and 120 characters.",
        400,
      );
    }
    if (
      typeof email !== "string" ||
      email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      throw new AuthenticationError("Enter a valid email address.", 400);
    }
    if (
      typeof password !== "string"
    ) {
      throw new AuthenticationError("Password is required.", 400);
    }
    if (password.length < 12 || password.length > 128) {
      throw new AuthenticationError(
        "Password must contain between 12 and 128 characters.",
        400,
      );
    }

    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await hashPassword(password);
    const institution = await prisma.$transaction(
      async (tx) => {
        if ((await tx.institution.count()) > 0) {
          throw new AuthenticationError(
            "Initial setup has already been completed.",
            409,
          );
        }
        const createdInstitution = await tx.institution.create({
          data: {
            name: institutionName.trim(),
            slug: normalizedSlug,
          },
        });
        const user = await tx.user.create({
          data: {
            name: name.trim(),
            email: normalizedEmail,
            passwordHash,
            emailVerified: new Date(),
          },
        });
        const membership = await tx.membership.create({
          data: {
            userId: user.id,
            institutionId: createdInstitution.id,
            role: CampusRole.SUPER_ADMIN,
            status: MembershipStatus.ACTIVE,
          },
        });
        await tx.auditEvent.create({
          data: {
            institutionId: createdInstitution.id,
            actorId: user.id,
            action: "institution.initialized",
            entityType: "Institution",
            entityId: createdInstitution.id,
          },
        });
        return { createdInstitution, user, membership };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await createSession(
      institution.user.id,
      institution.membership.id,
      request.headers.get("user-agent"),
    );
    return Response.json(
      {
        user: { id: institution.user.id, name: institution.user.name },
        institution: institution.createdInstitution,
        role: institution.membership.role,
      },
      { status: 201 },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
