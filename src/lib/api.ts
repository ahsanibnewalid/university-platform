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
  CampusRole.SUPER_ADMIN,
  CampusRole.UNIVERSITY_ADMIN,
  CampusRole.REGISTRAR,
  CampusRole.PRINCIPAL,
];

export const departmentRoles: CampusRole[] = [
  CampusRole.DEPARTMENT_HEAD,
  CampusRole.DEPARTMENT_CHAIR,
];

export const financeRoles: CampusRole[] = [
  ...administrativeRoles,
  CampusRole.FINANCE_ADMIN,
];

export const teachingRoles: CampusRole[] = [
  CampusRole.TEACHER,
  CampusRole.FACULTY,
  ...administrativeRoles,
  ...departmentRoles,
];

export const courseTeachingRoles: CampusRole[] = [
  CampusRole.TEACHER,
  CampusRole.FACULTY,
];

export const examManagementRoles: CampusRole[] = [
  ...teachingRoles,
  CampusRole.EXAM_CONTROLLER,
];

export const studentRoles: CampusRole[] = [
  CampusRole.STUDENT,
  CampusRole.MEDICAL_STUDENT,
  CampusRole.LAW_STUDENT,
];

export const inviteableCampusRoles: CampusRole[] = [
  CampusRole.STUDENT,
  CampusRole.PARENT,
  CampusRole.FACULTY,
  CampusRole.TEACHER,
  CampusRole.DEPARTMENT_CHAIR,
  CampusRole.DEPARTMENT_HEAD,
  CampusRole.PRINCIPAL,
  CampusRole.UNIVERSITY_ADMIN,
  CampusRole.REGISTRAR,
  CampusRole.EXAM_CONTROLLER,
  CampusRole.RECRUITER,
  CampusRole.CAMPUS_BUSINESS,
  CampusRole.MEDICAL_STUDENT,
  CampusRole.LAW_STUDENT,
  CampusRole.SUPER_ADMIN,
];

export function isPrismaUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
