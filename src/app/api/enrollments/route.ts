import { CampusRole, EnrollmentStatus, Prisma } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { readJsonObject, requiredText, recordAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const studentRoles = [CampusRole.STUDENT, CampusRole.MEDICAL_STUDENT, CampusRole.LAW_STUDENT];

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(studentRoles);
    const input = await readJsonObject(request);
    const sectionId = requiredText(input.sectionId, "Course section", 1, 100);
    const enrollment = await prisma.$transaction(
      async (tx) => {
        const section = await tx.courseSection.findFirst({
          where: {
            id: sectionId,
            term: {
              institutionId: session.membership.institutionId,
              status: "ACTIVE",
              startsAt: { lte: new Date() },
              endsAt: { gte: new Date() },
            },
          },
          select: { id: true, capacity: true, _count: { select: { enrollments: true } } },
        });
        if (!section) {
          throw new AuthenticationError("Registration is not open for that section.", 404);
        }
        if (section.capacity && section._count.enrollments >= section.capacity) {
          throw new AuthenticationError("This course section has no open seats.", 409);
        }
        return tx.enrollment.create({
          data: {
            sectionId,
            studentId: session.userId,
          },
          include: {
            section: { include: { course: { select: { code: true, title: true } } } },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await recordAudit(session, "academic.course.enrolled", "Enrollment", enrollment.id);
    return Response.json({ enrollment }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return Response.json(
        { error: "You are already enrolled, or the last available seat was taken." },
        { status: 409 },
      );
    }
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(studentRoles);
    const sectionId = new URL(request.url).searchParams.get("sectionId");
    if (!sectionId) throw new AuthenticationError("Course section is required.", 400);
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        sectionId,
        studentId: session.userId,
        status: EnrollmentStatus.ENROLLED,
        section: { term: { institutionId: session.membership.institutionId } },
      },
      select: { id: true, section: { select: { term: { select: { endsAt: true } } } } },
    });
    if (!enrollment) throw new AuthenticationError("Active enrollment not found.", 404);
    if (enrollment.section.term.endsAt < new Date()) {
      throw new AuthenticationError("A completed academic term cannot be withdrawn from.", 409);
    }
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status: EnrollmentStatus.WITHDRAWN },
    });
    await recordAudit(session, "academic.course.withdrawn", "Enrollment", enrollment.id);
    return Response.json({ withdrawn: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
