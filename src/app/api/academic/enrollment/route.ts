import {
  CampusRole,
  MembershipStatus,
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

const studentRoles: CampusRole[] = [
  CampusRole.STUDENT,
  CampusRole.MEDICAL_STUDENT,
  CampusRole.LAW_STUDENT,
];

const enrollmentManagers: CampusRole[] = [
  CampusRole.SUPER_ADMIN,
  CampusRole.UNIVERSITY_ADMIN,
  CampusRole.PRINCIPAL,
  CampusRole.REGISTRAR,
  CampusRole.OFFICE_STAFF,
];

function optionalIdentifier(value: unknown, label: string, maxLength = 50) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new AuthenticationError(`${label} must be text.`, 400);
  }
  const normalized = value.trim();
  if (normalized.length < 2 || normalized.length > maxLength || !/^[A-Za-z0-9/_-]+$/.test(normalized)) {
    throw new AuthenticationError(`${label} must contain 2-${maxLength} letters, numbers, or / _ - characters.`, 400);
  }
  return normalized;
}

export async function GET(request: Request) {
  try {
    const session = await requireSession([
      ...studentRoles,
      CampusRole.PARENT,
      ...enrollmentManagers,
    ]);
    const requestedStudentId = new URL(request.url).searchParams.get("studentId");
    const role = session.membership.role;
    let studentId: string;

    if (studentRoles.includes(role)) {
      const profile = await prisma.studentProfile.findFirst({
        where: {
          userId: session.userId,
          user: {
            memberships: {
              some: {
                institutionId: session.membership.institutionId,
                status: MembershipStatus.ACTIVE,
                role: { in: studentRoles },
              },
            },
          },
        },
        select: { userId: true },
      });
      if (!profile) throw new AuthenticationError("An active student profile is required.", 403);
      if (requestedStudentId && requestedStudentId !== profile.userId) {
        throw new AuthenticationError("You can only view your own academic enrollments.", 403);
      }
      studentId = profile.userId;
    } else {
      if (!requestedStudentId) {
        throw new AuthenticationError("studentId is required.", 400);
      }
      const profile = await prisma.studentProfile.findFirst({
        where: {
          userId: requestedStudentId,
          user: {
            memberships: {
              some: {
                institutionId: session.membership.institutionId,
                status: MembershipStatus.ACTIVE,
                role: { in: studentRoles },
              },
            },
          },
        },
        select: { userId: true },
      });
      if (!profile) throw new AuthenticationError("Active student profile not found.", 404);

      if (role === CampusRole.PARENT) {
        const guardianLink = await prisma.guardianLink.findFirst({
          where: {
            guardianId: session.userId,
            studentId: profile.userId,
            verifiedAt: { not: null },
          },
          select: { studentId: true },
        });
        if (!guardianLink) {
          throw new AuthenticationError("You are not authorized to view this student's enrollments.", 403);
        }
      } else if (!enrollmentManagers.includes(role)) {
        throw new AuthenticationError("Your role cannot view academic enrollments.", 403);
      }
      studentId = profile.userId;
    }

    const enrollments = await prisma.studentAcademicEnrollment.findMany({
      where: {
        institutionId: session.membership.institutionId,
        studentId,
      },
      include: {
        program: { select: { id: true, name: true, code: true, level: true, programType: true } },
        academicSession: { select: { id: true, name: true, startsAt: true, endsAt: true, status: true } },
        batch: { select: { id: true, name: true, startYear: true } },
      },
      orderBy: { admittedAt: "desc" },
      take: 100,
    });
    return Response.json({ enrollments });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(enrollmentManagers);
    const input = await readJsonObject(request);
    const studentId = requiredText(input.studentId, "Student", 1, 100);
    const programId = requiredText(input.programId, "Program", 1, 100);
    const academicSessionId = requiredText(input.academicSessionId, "Academic session", 1, 100);
    const admissionNumber = requiredText(input.admissionNumber, "Admission number", 2, 50);
    if (!/^[A-Za-z0-9/_-]+$/.test(admissionNumber)) {
      throw new AuthenticationError("Admission number may contain only letters, numbers, / _ and -.", 400);
    }
    const nuRegistrationNumber = optionalIdentifier(input.nuRegistrationNumber, "National University registration number");
    const batchId = input.batchId === undefined || input.batchId === null || input.batchId === ""
      ? null
      : requiredText(input.batchId, "Batch", 1, 100);

    const [studentProfile, program, academicSession, batch] = await Promise.all([
      prisma.studentProfile.findFirst({
        where: {
          userId: studentId,
          user: {
            memberships: {
              some: {
                institutionId: session.membership.institutionId,
                status: MembershipStatus.ACTIVE,
                role: { in: studentRoles },
              },
            },
          },
        },
        select: { userId: true },
      }),
      prisma.program.findFirst({
        where: {
          id: programId,
          department: { institutionId: session.membership.institutionId },
        },
        select: { id: true, programType: true },
      }),
      prisma.academicSession.findFirst({
        where: {
          id: academicSessionId,
          institutionId: session.membership.institutionId,
        },
        select: { id: true, programId: true },
      }),
      batchId
        ? prisma.batch.findFirst({
            where: {
              id: batchId,
              programId,
              program: { department: { institutionId: session.membership.institutionId } },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    if (!studentProfile) throw new AuthenticationError("Active student profile not found.", 404);
    if (!program) throw new AuthenticationError("Program not found for this college.", 404);
    if (!academicSession) throw new AuthenticationError("Academic session not found for this college.", 404);
    if (academicSession.programId && academicSession.programId !== program.id) {
      throw new AuthenticationError("The academic session does not belong to the selected program.", 400);
    }
    if (batchId && !batch) throw new AuthenticationError("Batch not found for the selected program.", 404);
    if (program.programType !== ProgramType.HSC && !nuRegistrationNumber) {
      throw new AuthenticationError("National University registration number is required for this program type.", 400);
    }
    if (program.programType === ProgramType.HSC && nuRegistrationNumber) {
      throw new AuthenticationError("Do not provide a National University registration number for HSC enrollment.", 400);
    }

    const enrollment = await prisma.$transaction(async (tx) => {
      const created = await tx.studentAcademicEnrollment.create({
        data: {
          institutionId: session.membership.institutionId,
          studentId: studentProfile.userId,
          programId: program.id,
          academicSessionId: academicSession.id,
          batchId: batch?.id ?? null,
          admissionNumber,
          nuRegistrationNumber,
        },
        include: {
          program: { select: { id: true, name: true, code: true, programType: true } },
          academicSession: { select: { id: true, name: true, startsAt: true, endsAt: true } },
          batch: { select: { id: true, name: true } },
        },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "academic.enrollment.created",
          entityType: "StudentAcademicEnrollment",
          entityId: created.id,
          metadata: {
            studentId: studentProfile.userId,
            programId: program.id,
            academicSessionId: academicSession.id,
            admissionNumber,
            nuRegistrationNumber,
          },
        },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return Response.json({ enrollment }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json(
        { error: "This student is already enrolled in that program/session, or the admission/NU registration number is already in use." },
        { status: 409 },
      );
    }
    return authErrorResponse(error);
  }
}
