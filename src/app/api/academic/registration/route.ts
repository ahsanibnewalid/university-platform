import { CampusRole } from "@prisma/client";
import { AuthenticationError, assertSameOrigin, authErrorResponse, requireSession } from "@/lib/auth";
import { readJsonObject, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { registerStudentForCourseSections } from "@/lib/academic-registration";

const studentRoles: CampusRole[] = [CampusRole.STUDENT, CampusRole.MEDICAL_STUDENT, CampusRole.LAW_STUDENT];
const managerRoles: CampusRole[] = [CampusRole.SUPER_ADMIN, CampusRole.UNIVERSITY_ADMIN, CampusRole.PRINCIPAL, CampusRole.REGISTRAR, CampusRole.OFFICE_STAFF, CampusRole.EXAM_CONTROLLER];

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession([...studentRoles, ...managerRoles]);
    const input = await readJsonObject(request);
    const programEnrollmentId = requiredText(input.programEnrollmentId, "Programme enrollment", 1, 100);
    if (!Array.isArray(input.sectionIds) || input.sectionIds.some((id) => typeof id !== "string" || id.trim().length < 1 || id.trim().length > 100)) {
      throw new AuthenticationError("sectionIds must be an array of section identifiers.", 400);
    }
    const enrollment = await prisma.studentAcademicEnrollment.findFirst({
      where: { id: programEnrollmentId, institutionId: session.membership.institutionId },
      select: { id: true, studentId: true },
    });
    if (!enrollment) throw new AuthenticationError("Programme enrollment not found.", 404);
    if (studentRoles.includes(session.membership.role) && enrollment.studentId !== session.userId) {
      throw new AuthenticationError("You can only register your own programme enrollment.", 403);
    }
    const registration = await registerStudentForCourseSections({
      institutionId: session.membership.institutionId,
      programEnrollmentId,
      actorId: session.userId,
      sectionIds: input.sectionIds as string[],
    });
    return Response.json({ registration });
  } catch (error) {
    return authErrorResponse(error);
  }
}
