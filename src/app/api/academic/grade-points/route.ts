import {
  CampusRole,
  Prisma,
  ProgramType,
} from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { readJsonObject, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const gradePolicyManagers: CampusRole[] = [
  CampusRole.SUPER_ADMIN,
  CampusRole.UNIVERSITY_ADMIN,
  CampusRole.PRINCIPAL,
  CampusRole.REGISTRAR,
  CampusRole.EXAM_CONTROLLER,
];

function isProgramType(value: unknown): value is ProgramType {
  return typeof value === "string" &&
    Object.values(ProgramType).includes(value as ProgramType);
}

function percentage(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new AuthenticationError(`${label} must be between 0 and 100.`, 400);
  }
  const decimal = new Prisma.Decimal(value);
  if (decimal.decimalPlaces() > 2) {
    throw new AuthenticationError(`${label} can have at most two decimal places.`, 400);
  }
  return decimal;
}

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const requestedType = new URL(request.url).searchParams.get("programType");
    let programType: ProgramType | undefined;
    if (requestedType) {
      if (!isProgramType(requestedType)) {
        throw new AuthenticationError("Select a valid program type.", 400);
      }
      programType = requestedType;
    }
    const gradePoints = await prisma.gradePoint.findMany({
      where: {
        institutionId: session.membership.institutionId,
        ...(programType ? { programType } : {}),
      },
      orderBy: [{ programType: "asc" }, { minimumPercentage: "desc" }],
      take: 250,
    });
    return Response.json({ gradePoints });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(gradePolicyManagers);
    const input = await readJsonObject(request);
    if (!isProgramType(input.programType)) {
      throw new AuthenticationError("Select a valid program type.", 400);
    }
    const programType = input.programType;
    const letterGrade = requiredText(input.letterGrade, "Letter grade", 1, 8).toUpperCase();
    if (!/^[A-F][+-]?$/.test(letterGrade)) {
      throw new AuthenticationError("Letter grade must use a standard A-F grade, optionally with + or -.", 400);
    }
    const minimumPercentage = percentage(input.minimumPercentage, "Minimum percentage");
    const maximumPercentage = percentage(input.maximumPercentage, "Maximum percentage");
    const maxGradePoint = programType === ProgramType.HSC ? 5 : 4;
    if (maximumPercentage.lessThan(minimumPercentage)) {
      throw new AuthenticationError("Maximum percentage must be at least the minimum percentage.", 400);
    }
    if (
      typeof input.gradePoint !== "number" ||
      !Number.isFinite(input.gradePoint) ||
      input.gradePoint < 0 ||
      input.gradePoint > maxGradePoint
    ) {
      throw new AuthenticationError(`Grade point must be between 0 and ${maxGradePoint} for ${programType}.`, 400);
    }
    const gradePoint = new Prisma.Decimal(input.gradePoint);
    if (gradePoint.decimalPlaces() > 2) {
      throw new AuthenticationError("Grade point can have at most two decimal places.", 400);
    }
    const description = typeof input.description === "string"
      ? input.description.trim().slice(0, 200)
      : null;
    if (minimumPercentage.equals(maximumPercentage)) {
      throw new AuthenticationError("A grade percentage range must include more than one boundary value.", 400);
    }

    const overlap = await prisma.gradePoint.findFirst({
      where: {
        institutionId: session.membership.institutionId,
        programType,
        minimumPercentage: { lte: maximumPercentage },
        maximumPercentage: { gte: minimumPercentage },
      },
      select: { id: true, letterGrade: true },
    });
    if (overlap) {
      throw new AuthenticationError(
        `This percentage range overlaps the existing ${overlap.letterGrade} grade for ${programType}.`,
        409,
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const grade = await tx.gradePoint.create({
        data: {
          institutionId: session.membership.institutionId,
          programType,
          letterGrade,
          minimumPercentage,
          maximumPercentage,
          gradePoint,
          description,
        },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "academic.grade_point.created",
          entityType: "GradePoint",
          entityId: grade.id,
          metadata: {
            programType,
            letterGrade,
            minimumPercentage: minimumPercentage.toFixed(2),
            maximumPercentage: maximumPercentage.toFixed(2),
            gradePoint: gradePoint.toFixed(2),
          },
        },
      });
      return grade;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ gradePoint: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "That letter grade already exists for this program type." }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}
