import { CampusRole, Prisma } from "@prisma/client";
import { AuthenticationError, CurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function readJsonObject(request: Request) {
  let value: unknown;
  try {
    value = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new AuthenticationError("Request body must be valid JSON.", 400);
    }
    throw error;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthenticationError("Request body must be an object.", 400);
  }
  return value as Record<string, unknown>;
}

export function requireAnyRole(session: CurrentSession, roles: CampusRole[]) {
  if (!roles.includes(session.membership.role)) {
    throw new AuthenticationError(
      "Your active campus role does not permit this action.",
      403,
    );
  }
}

export function requiredText(
  value: unknown,
  label: string,
  minLength = 1,
  maxLength = 200,
) {
  if (
    typeof value !== "string" ||
    value.trim().length < minLength ||
    value.trim().length > maxLength
  ) {
    throw new AuthenticationError(
      `${label} must be between ${minLength} and ${maxLength} characters.`,
      400,
    );
  }
  return value.trim();
}

export function validDate(value: unknown, label: string) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new AuthenticationError(`${label} must be a valid date.`, 400);
  }
  return new Date(value);
}

export async function recordAudit(
  session: CurrentSession,
  action: string,
  entityType: string,
  entityId?: string,
) {
  await prisma.auditEvent.create({
    data: {
      institutionId: session.membership.institutionId,
      actorId: session.userId,
      action,
      entityType,
      entityId,
    },
  });
}

export const administrativeRoles: CampusRole[] = [
  CampusRole.DEPARTMENT_CHAIR,
  CampusRole.PRINCIPAL,
  CampusRole.UNIVERSITY_ADMIN,
  CampusRole.SUPER_ADMIN,
];

export const teachingRoles: CampusRole[] = [CampusRole.FACULTY, ...administrativeRoles];

export function isPrismaUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
