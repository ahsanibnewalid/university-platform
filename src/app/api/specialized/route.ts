import { CampusRole } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { readJsonObject, recordAudit, requiredText, validDate } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const staffRoles: CampusRole[] = [
  CampusRole.FACULTY,
  CampusRole.DEPARTMENT_CHAIR,
  CampusRole.PRINCIPAL,
  CampusRole.UNIVERSITY_ADMIN,
  CampusRole.SUPER_ADMIN,
];

export async function GET() {
  try {
    const session = await requireSession();
    if (session.membership.role === CampusRole.MEDICAL_STUDENT) {
      const placements = await prisma.medicalPlacement.findMany({
        where: { studentId: session.userId },
        select: {
          id: true,
          organization: true,
          specialty: true,
          startsAt: true,
          endsAt: true,
          completedAt: true,
        },
        orderBy: { startsAt: "desc" },
      });
      return Response.json({ placements });
    }
    if (session.membership.role === CampusRole.LAW_STUDENT) {
      const cases = await prisma.legalClinicCase.findMany({
        where: { studentId: session.userId },
        select: {
          id: true,
          caseTitle: true,
          caseReference: true,
          clinic: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
      return Response.json({ cases });
    }
    const [placements, cases] = await Promise.all([
      prisma.medicalPlacement.findMany({
        where: {
          student: {
            memberships: {
              some: { institutionId: session.membership.institutionId, status: "ACTIVE" },
            },
          },
          ...(staffRoles.includes(session.membership.role)
            ? {}
            : { supervisorId: session.userId }),
        },
        select: {
          id: true,
          organization: true,
          specialty: true,
          startsAt: true,
          endsAt: true,
          completedAt: true,
          student: { select: { id: true, name: true } },
        },
        orderBy: { startsAt: "asc" },
        take: 100,
      }),
      session.membership.role === CampusRole.SUPER_ADMIN
        ? prisma.legalClinicCase.findMany({
            where: {
              student: {
                memberships: {
                  some: { institutionId: session.membership.institutionId, status: "ACTIVE" },
                },
              },
            },
            select: { id: true, caseTitle: true, clinic: true, createdAt: true },
            take: 100,
          })
        : Promise.resolve([]),
    ]);
    return Response.json({ placements, cases });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const input = await readJsonObject(request);
    if (session.membership.role === CampusRole.LAW_STUDENT) {
      const caseTitle = requiredText(input.caseTitle, "Moot or clinic exercise", 3, 180);
      const clinic = requiredText(input.clinic, "Clinic or course", 2, 120);
      const caseReference =
        typeof input.caseReference === "string"
          ? input.caseReference.trim().slice(0, 100)
          : null;
      const legalCase = await prisma.legalClinicCase.create({
        data: { studentId: session.userId, caseTitle, caseReference, clinic },
      });
      await recordAudit(session, "academic.law_exercise.created", "LegalClinicCase", legalCase.id);
      return Response.json({ case: legalCase }, { status: 201 });
    }
    if (!staffRoles.includes(session.membership.role)) {
      throw new AuthenticationError("Only a medical student may add exercises to their own portfolio.", 403);
    }
    const studentId = requiredText(input.studentId, "Medical student", 1, 100);
    const organization = requiredText(input.organization, "Placement provider", 2, 180);
    const specialty = requiredText(input.specialty, "Specialty", 2, 120);
    const startsAt = validDate(input.startsAt, "Start date");
    const endsAt = validDate(input.endsAt, "End date");
    if (endsAt <= startsAt) throw new AuthenticationError("End date must be after the start date.", 400);
    const student = await prisma.membership.findFirst({
      where: {
        userId: studentId,
        institutionId: session.membership.institutionId,
        status: "ACTIVE",
        role: CampusRole.MEDICAL_STUDENT,
      },
      select: { userId: true },
    });
    if (!student) throw new AuthenticationError("Active medical student not found.", 404);
    const placement = await prisma.medicalPlacement.create({
      data: {
        studentId,
        supervisorId: session.userId,
        organization,
        specialty,
        startsAt,
        endsAt,
      },
    });
    await recordAudit(session, "academic.medical_placement.created", "MedicalPlacement", placement.id);
    return Response.json({ placement }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
